import { runPendingConversationSummaryProjections } from "./memoryProjectionRunner";

let pendingTimer: ReturnType<typeof setTimeout> | undefined;

/** Schedules at most one short, fire-and-forget drain for this runtime. */
export function scheduleMemoryProjectionDrain(): boolean {
  if (pendingTimer !== undefined) return false;
  pendingTimer = setTimeout(() => {
    pendingTimer = undefined;
    void runPendingConversationSummaryProjections().catch((error) => {
      console.warn("[memory-projection] Enqueue-triggered drain failed open.", error);
    });
  }, 0);
  return true;
}

/** Test-only cleanup; production callers never need to cancel the timer. */
export function clearScheduledMemoryProjectionDrainForTests(): void {
  if (pendingTimer !== undefined) clearTimeout(pendingTimer);
  pendingTimer = undefined;
}
