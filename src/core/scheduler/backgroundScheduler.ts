export type BackgroundTaskStatus = "pending" | "running" | "success" | "failed" | "cancelled" | "expired";

export interface BackgroundTaskSnapshot {
  id: string;
  status: BackgroundTaskStatus;
  attempts: number;
  maxAttempts: number;
  lastStartedAt?: number;
  lastFinishedAt?: number;
  lastError?: string;
}

export interface BackgroundTaskOptions {
  id: string;
  intervalMs: number;
  initialDelayMs?: number;
  maxAttempts?: number;
  run: () => void | Promise<void>;
}

/**
 * Small in-memory scheduler for component-owned background work. It deliberately
 * does not persist task payloads or change product timing rules. Its guarantees
 * are limited to one active timer, no overlapping executions, and recovery
 * after a failed pass.
 */
export class BackgroundScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private running = false;
  private snapshot: BackgroundTaskSnapshot;

  constructor(private readonly options: BackgroundTaskOptions) {
    this.snapshot = {
      id: options.id,
      status: "pending",
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(this.options.initialDelayMs ?? this.options.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.snapshot.status !== "expired") this.snapshot.status = "cancelled";
  }

  getSnapshot(): BackgroundTaskSnapshot {
    return { ...this.snapshot };
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.execute(), Math.max(0, delayMs));
  }

  private async execute(): Promise<void> {
    this.timer = null;
    if (this.stopped || this.running) return;
    this.running = true;
    this.snapshot.status = "running";
    this.snapshot.attempts += 1;
    this.snapshot.lastStartedAt = Date.now();
    try {
      await this.options.run();
      this.snapshot.status = this.stopped ? "cancelled" : "success";
      this.snapshot.attempts = 0;
      this.snapshot.lastError = undefined;
    } catch (error) {
      this.snapshot.status = "failed";
      this.snapshot.lastError = error instanceof Error ? error.message : String(error);
      if (this.snapshot.attempts >= this.snapshot.maxAttempts) this.snapshot.status = "expired";
    } finally {
      this.running = false;
      this.snapshot.lastFinishedAt = Date.now();
      if (!this.stopped && this.snapshot.status !== "expired") this.schedule(this.options.intervalMs);
    }
  }
}
