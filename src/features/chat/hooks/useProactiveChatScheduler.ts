import { useBackgroundScheduler } from "../../../core/scheduler/useBackgroundScheduler";

interface UseProactiveChatSchedulerOptions {
  enabled: boolean;
  runCatchupPass: () => void | Promise<void>;
  runBackgroundPass: () => void | Promise<void>;
}

/** Keeps proactive chat timers outside the chat view's render and UI lifecycle. */
export function useProactiveChatScheduler({
  enabled,
  runCatchupPass,
  runBackgroundPass,
}: UseProactiveChatSchedulerOptions): void {
  useBackgroundScheduler({
    id: "chat-proactive-catchup",
    enabled,
    intervalMs: 15 * 60 * 1000,
    initialDelayMs: 0,
    taskType: "proactive-chat-catchup",
    reason: "scheduled-catchup",
    recoveryPayload: { scope: "active-identity" },
    run: runCatchupPass,
    pauseWhenHidden: true,
    pauseWhenOffline: true,
  });

  useBackgroundScheduler({
    id: "chat-background-proactive",
    enabled,
    intervalMs: 60 * 1000,
    initialDelayMs: 3000,
    taskType: "proactive-chat-background",
    reason: "scheduled-background-pass",
    recoveryPayload: { scope: "active-identity" },
    run: runBackgroundPass,
    pauseWhenHidden: true,
    pauseWhenOffline: true,
  });
}
