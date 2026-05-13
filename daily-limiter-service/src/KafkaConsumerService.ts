import { Kafka, Consumer, KafkaMessage, EachMessagePayload } from 'kafkajs';
import { DailyActionLimiter } from './DailyActionLimiter';
import { ActionHandler, MessagePayload } from './ActionHandler';

export interface KafkaConsumerConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  topic: string;
  stateFilePath?: string;
}

export class KafkaConsumerService {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly limiter: DailyActionLimiter;
  private readonly handler: ActionHandler;
  private readonly topic: string;

  constructor(config: KafkaConsumerConfig, handler: ActionHandler) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
    });

    this.consumer = this.kafka.consumer({ groupId: config.groupId });
    this.limiter = new DailyActionLimiter(config.stateFilePath);
    this.handler = handler;
    this.topic = config.topic;
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    console.log(`[KafkaConsumerService] Connected. Subscribing to topic "${this.topic}"`);

    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload.message, payload.topic, payload.partition);
      },
    });
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
    console.log('[KafkaConsumerService] Disconnected.');
  }

  private async handleMessage(
    message: KafkaMessage,
    topic: string,
    partition: number,
  ): Promise<void> {
    const key = message.key?.toString();

    if (!key) {
      console.warn('[KafkaConsumerService] Skipping message with no key.');
      return;
    }

    if (!this.limiter.canExecute(key)) {
      const remainingMs = this.limiter.cooldownRemaining(key);
      const remainingMin = Math.ceil(remainingMs / 60_000);
      console.log(
        `[KafkaConsumerService] Skipping key="${key}" — cooldown active (${remainingMin} min remaining).`
      );
      return;
    }

    const payload: MessagePayload = {
      key,
      value: message.value?.toString() ?? null,
      topic,
      partition,
      offset: message.offset,
      timestamp: message.timestamp,
    };

    try {
      await this.handler.execute(payload);
      this.limiter.markExecuted(key);
      console.log(`[KafkaConsumerService] Action executed and cooldown set for key="${key}".`);
    } catch (err) {
      // Do NOT mark as executed so the next message for this key can retry.
      console.error(`[KafkaConsumerService] Action failed for key="${key}":`, err);
    }
  }
}
