import 'dotenv/config';
import { KafkaConsumerService } from './KafkaConsumerService';
import { LogActionHandler } from './ActionHandler';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const config = {
  brokers: requireEnv('KAFKA_BROKERS').split(',').map(b => b.trim()),
  clientId: process.env['KAFKA_CLIENT_ID'] ?? 'daily-action-limiter',
  groupId: process.env['KAFKA_GROUP_ID'] ?? 'daily-action-limiter-group',
  topic: requireEnv('KAFKA_TOPIC'),
  stateFilePath: process.env['STATE_FILE_PATH'] ?? './limiter-state.json',
};

const handler = new LogActionHandler();
// Swap LogActionHandler for your own ActionHandler implementation here.

const service = new KafkaConsumerService(config, handler);

async function main(): Promise<void> {
  await service.start();
  console.log('[main] Consumer running. Press Ctrl+C to stop.');
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[main] Received ${signal}, shutting down...`);
  await service.stop();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch(err => {
  console.error('[main] Fatal error:', err);
  process.exit(1);
});
