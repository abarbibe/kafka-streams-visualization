export interface MessagePayload {
  key: string;
  value: string | null;
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
}

/**
 * Implement this interface to define what happens when a key is eligible.
 */
export interface ActionHandler {
  execute(payload: MessagePayload): Promise<void>;
}

/**
 * Default action: logs the event. Replace or extend with real side-effects
 * (HTTP calls, DB writes, notifications, etc.).
 */
export class LogActionHandler implements ActionHandler {
  async execute(payload: MessagePayload): Promise<void> {
    console.log(
      `[Action] key="${payload.key}" topic=${payload.topic} ` +
      `partition=${payload.partition} offset=${payload.offset} ` +
      `value=${payload.value}`
    );
  }
}
