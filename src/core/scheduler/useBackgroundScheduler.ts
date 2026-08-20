import { useEffect, useRef } from "react";
import { BackgroundScheduler, type BackgroundTaskSnapshot } from "./backgroundScheduler";
import { loadRecoverableBackgroundTaskSnapshots, type BackgroundTaskPayloadValue } from "./schedulerTaskRepository";
import { registerBackgroundTaskFactory } from "./schedulerRegistry";

interface UseBackgroundSchedulerOptions {
  id: string;
  enabled: boolean;
  intervalMs: number;
  initialDelayMs?: number;
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
}

export function useBackgroundScheduler({ id, enabled, intervalMs, initialDelayMs, run, onState, pauseWhenHidden, pauseWhenOffline, reason, taskType, cooldownUntil, userRejected, metadata, recoveryPayload }: UseBackgroundSchedulerOptions): void {
  const runRef = useRef(run);
  const onStateRef = useRef(onState);
  const schedulerRef = useRef<BackgroundScheduler | null>(null);
  const optionsRef = useRef({ enabled, id, intervalMs, initialDelayMs, pauseWhenHidden, pauseWhenOffline, reason, taskType, cooldownUntil, userRejected, metadata, recoveryPayload });
  runRef.current = run;
  onStateRef.current = onState;
  optionsRef.current = { enabled, id, intervalMs, initialDelayMs, pauseWhenHidden, pauseWhenOffline, reason, taskType, cooldownUntil, userRejected, metadata, recoveryPayload };

  useEffect(() => {
    if (!enabled) return undefined;
    const unregister = taskType
      ? registerBackgroundTaskFactory(taskType, (snapshot) => {
        const current = optionsRef.current;
        if (!current.enabled || current.id !== snapshot.id) return null;
        return {
          id: current.id,
          intervalMs: current.intervalMs,
          initialDelayMs: current.initialDelayMs,
          run: () => runRef.current(),
          onState: (nextSnapshot) => onStateRef.current?.(nextSnapshot),
          pauseWhenHidden: current.pauseWhenHidden,
          pauseWhenOffline: current.pauseWhenOffline,
          reason: current.reason,
          taskType: current.taskType,
          cooldownUntil: current.cooldownUntil,
          userRejected: current.userRejected,
          metadata: current.metadata,
          recoveryPayload: current.recoveryPayload,
          resumeFrom: snapshot,
        };
      })
      : undefined;
    const resumeFrom = loadRecoverableBackgroundTaskSnapshots().find((snapshot) => snapshot.id === id);
    const scheduler = new BackgroundScheduler({
      id,
      intervalMs,
      initialDelayMs,
      run: () => runRef.current(),
      onState: (snapshot) => onStateRef.current?.(snapshot),
      pauseWhenHidden,
      pauseWhenOffline,
      reason,
      taskType,
      cooldownUntil,
      userRejected,
      metadata,
      recoveryPayload,
      resumeFrom,
    });
    schedulerRef.current = scheduler;
    scheduler.start();
    return () => {
      scheduler.stop();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
      unregister?.();
    };
  }, [enabled, id, intervalMs, initialDelayMs, taskType, pauseWhenHidden, pauseWhenOffline]);

  useEffect(() => {
    schedulerRef.current?.updateDescriptor({ reason, cooldownUntil, userRejected, metadata, recoveryPayload });
  }, [reason, cooldownUntil, userRejected, metadata, recoveryPayload]);
}
