import { acquireBackgroundTaskLease, releaseBackgroundTaskLease, renewBackgroundTaskLease, savePersistedBackgroundTaskSnapshot, type BackgroundTaskPayloadValue } from "./schedulerTaskRepository";
import { getSchedulerNow } from "./schedulerClock";
import { createId } from "../id/createId";

export type BackgroundTaskStatus = "pending" | "running" | "success" | "failed" | "cancelled" | "expired";

export interface BackgroundTaskSnapshot {
  id: string;
  status: BackgroundTaskStatus;
  attempts: number;
  maxAttempts: number;
  lastStartedAt?: number;
  lastFinishedAt?: number;
  lastError?: string;
  reason?: string;
  taskType?: string;
  cooldownUntil?: number;
  userRejected?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
  recoveryPayload?: Record<string, BackgroundTaskPayloadValue>;
}

export interface BackgroundTaskOptions {
  id: string;
  intervalMs: number;
  initialDelayMs?: number;
  maxAttempts?: number;
  run: () => void | Promise<void>;
  onState?: (snapshot: BackgroundTaskSnapshot) => void;
  pauseWhenHidden?: boolean;
  pauseWhenOffline?: boolean;
  reason?: string;
  taskType?: string;
  cooldownUntil?: number;
  userRejected?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
  recoveryPayload?: Record<string, BackgroundTaskPayloadValue>;
  resumeFrom?: Partial<BackgroundTaskSnapshot>;
  leaseMs?: number;
}

export interface BackgroundTaskDescriptorUpdate {
  reason?: string;
  cooldownUntil?: number;
  userRejected?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
  recoveryPayload?: Record<string, BackgroundTaskPayloadValue>;
}

/**
 * Small in-memory scheduler for component-owned background work. It deliberately
 * does not persist private task content or change product timing rules. Its guarantees
 * are limited to one active timer, no overlapping executions, and recovery
 * after a failed pass.
 */
export class BackgroundScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private running = false;
  private leaseHeartbeat: ReturnType<typeof setInterval> | null = null;
  private leaseLost = false;
  private suspendedByPageLifecycle = false;
  private snapshot: BackgroundTaskSnapshot;
  private readonly environmentChangeHandler = () => this.handleEnvironmentChange();
  private readonly pageHideHandler = () => this.handlePageHide();
  private readonly pageShowHandler = () => this.handlePageShow();
  private readonly ownerId = createId("scheduler-owner");

  constructor(private readonly options: BackgroundTaskOptions) {
    const restored = options.resumeFrom;
    this.snapshot = {
      id: options.id,
      status: restored?.status || "pending",
      attempts: restored?.attempts ?? 0,
      maxAttempts: restored?.maxAttempts ?? options.maxAttempts ?? 3,
      lastStartedAt: restored?.lastStartedAt,
      lastFinishedAt: restored?.lastFinishedAt,
      lastError: restored?.lastError,
      reason: options.reason ?? restored?.reason,
      taskType: options.taskType ?? restored?.taskType,
      cooldownUntil: options.cooldownUntil ?? restored?.cooldownUntil,
      userRejected: options.userRejected ?? restored?.userRejected,
      metadata: options.metadata ?? restored?.metadata,
      recoveryPayload: options.recoveryPayload ?? restored?.recoveryPayload,
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attachEnvironmentListeners();
    this.publish();
    this.schedule(this.options.initialDelayMs ?? this.options.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    this.suspendedByPageLifecycle = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.detachEnvironmentListeners();
    if (this.snapshot.status !== "expired") this.snapshot.status = "cancelled";
    this.publish();
  }

  getSnapshot(): BackgroundTaskSnapshot {
    return { ...this.snapshot };
  }

  /**
   * Updates persisted task descriptors without touching the active timer.
   * React callers often construct metadata objects inline; descriptor changes
   * must not turn ordinary renders into scheduler stop/start cycles.
   */
  updateDescriptor(update: BackgroundTaskDescriptorUpdate): void {
    this.options.reason = update.reason;
    this.options.cooldownUntil = update.cooldownUntil;
    this.options.userRejected = update.userRejected;
    this.options.metadata = update.metadata;
    this.options.recoveryPayload = update.recoveryPayload;
    this.snapshot.reason = update.reason;
    this.snapshot.cooldownUntil = update.cooldownUntil;
    this.snapshot.userRejected = update.userRejected;
    this.snapshot.metadata = update.metadata;
    this.snapshot.recoveryPayload = update.recoveryPayload;
    this.publish();
  }

  private publish(): void {
    savePersistedBackgroundTaskSnapshot(this.snapshot);
    try {
      this.options.onState?.(this.getSnapshot());
    } catch {
      // Diagnostics must never break the task it observes.
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.execute(), Math.max(0, delayMs));
  }

  private canRunInCurrentEnvironment(): boolean {
    if (this.snapshot.userRejected || (this.snapshot.cooldownUntil !== undefined && this.snapshot.cooldownUntil > getSchedulerNow())) return false;
    if (this.options.pauseWhenHidden && typeof document !== "undefined" && document.hidden) return false;
    if (this.options.pauseWhenOffline && typeof navigator !== "undefined" && navigator.onLine === false) return false;
    return true;
  }

  private attachEnvironmentListeners(): void {
    if (this.options.pauseWhenHidden && typeof document !== "undefined") document.addEventListener("visibilitychange", this.environmentChangeHandler);
    if (this.options.pauseWhenOffline && typeof window !== "undefined") {
      window.addEventListener("online", this.environmentChangeHandler);
      window.addEventListener("offline", this.environmentChangeHandler);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.pageHideHandler);
      window.addEventListener("pageshow", this.pageShowHandler);
    }
  }

  private detachEnvironmentListeners(): void {
    if (this.options.pauseWhenHidden && typeof document !== "undefined") document.removeEventListener("visibilitychange", this.environmentChangeHandler);
    if (this.options.pauseWhenOffline && typeof window !== "undefined") {
      window.removeEventListener("online", this.environmentChangeHandler);
      window.removeEventListener("offline", this.environmentChangeHandler);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.pageHideHandler);
      window.removeEventListener("pageshow", this.pageShowHandler);
    }
  }

  private handleEnvironmentChange(): void {
    if (this.stopped || this.running || !this.canRunInCurrentEnvironment()) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.schedule(0);
  }

  private handlePageHide(): void {
    if (this.stopped) return;
    this.suspendedByPageLifecycle = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Keep pending/running state recoverable. React cleanup may later call
    // stop() for a real unmount, which remains an explicit cancellation.
    this.publish();
  }

  private handlePageShow(): void {
    if (this.stopped) return;
    this.suspendedByPageLifecycle = false;
    if (this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.schedule(0);
  }

  private async execute(): Promise<void> {
    this.timer = null;
    if (this.stopped || this.running || this.suspendedByPageLifecycle) return;
    if (!this.canRunInCurrentEnvironment()) {
      this.schedule(this.options.intervalMs);
      return;
    }
    const leaseMs = this.options.leaseMs ?? 30_000;
    if (!acquireBackgroundTaskLease(this.options.id, this.ownerId, getSchedulerNow(), leaseMs)) {
      this.schedule(this.options.intervalMs);
      return;
    }
    this.leaseLost = false;
    this.leaseHeartbeat = setInterval(() => {
      if (!renewBackgroundTaskLease(this.options.id, this.ownerId, getSchedulerNow(), leaseMs)) this.leaseLost = true;
    }, Math.max(1000, Math.floor(leaseMs / 3)));
    this.running = true;
    this.snapshot.status = "running";
    this.snapshot.attempts += 1;
    this.snapshot.lastStartedAt = getSchedulerNow();
    this.publish();
    try {
      await this.options.run();
      this.snapshot.status = this.stopped ? "cancelled" : this.leaseLost ? "failed" : "success";
      this.snapshot.attempts = 0;
      this.snapshot.lastError = undefined;
    } catch (error) {
      this.snapshot.status = "failed";
      this.snapshot.lastError = error instanceof Error ? error.message : String(error);
      if (this.snapshot.attempts >= this.snapshot.maxAttempts) this.snapshot.status = "expired";
    } finally {
      if (this.leaseHeartbeat) clearInterval(this.leaseHeartbeat);
      this.leaseHeartbeat = null;
      if (this.leaseLost) {
        this.snapshot.lastError = "scheduler lease lost while task was running";
        this.snapshot.attempts = Math.max(1, this.snapshot.attempts);
      }
      releaseBackgroundTaskLease(this.options.id, this.ownerId);
      this.running = false;
      this.snapshot.lastFinishedAt = getSchedulerNow();
      this.publish();
      if (!this.stopped && this.snapshot.status !== "expired") this.schedule(this.options.intervalMs);
    }
  }
}
