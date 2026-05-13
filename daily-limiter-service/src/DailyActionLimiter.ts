import * as fs from 'fs';
import * as path from 'path';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tracks per-key action timestamps and enforces a 24-hour cooldown.
 * State is persisted to disk so it survives process restarts.
 */
export class DailyActionLimiter {
  private readonly stateFile: string;
  private lastActionAt: Map<string, number>;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(stateFilePath: string = './limiter-state.json') {
    this.stateFile = path.resolve(stateFilePath);
    this.lastActionAt = this.loadState();
  }

  /**
   * Returns true if the action for this key may run (no action in the past 24h).
   * Calling this does NOT mark the key as executed — call markExecuted() after
   * the action succeeds.
   */
  canExecute(key: string): boolean {
    const last = this.lastActionAt.get(key);
    if (last === undefined) return true;
    return Date.now() - last >= MS_PER_DAY;
  }

  /**
   * Records that the action for key was executed right now.
   */
  markExecuted(key: string): void {
    this.lastActionAt.set(key, Date.now());
    this.scheduleFlush();
  }

  /**
   * Returns how many milliseconds remain before the key's cooldown expires,
   * or 0 if it is already eligible.
   */
  cooldownRemaining(key: string): number {
    const last = this.lastActionAt.get(key);
    if (last === undefined) return 0;
    return Math.max(0, MS_PER_DAY - (Date.now() - last));
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    // Batch writes: flush at most once per second
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.persistState();
    }, 1000);
  }

  private persistState(): void {
    const data: Record<string, number> = {};
    for (const [key, ts] of this.lastActionAt) {
      data[key] = ts;
    }
    fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  private loadState(): Map<string, number> {
    if (!fs.existsSync(this.stateFile)) {
      return new Map();
    }
    try {
      const raw = fs.readFileSync(this.stateFile, 'utf-8');
      const data: Record<string, number> = JSON.parse(raw);
      return new Map(Object.entries(data));
    } catch {
      console.warn(`[DailyActionLimiter] Could not read state file ${this.stateFile}, starting fresh.`);
      return new Map();
    }
  }
}
