import { readJson, writeJson } from "../storage/storageAdapter";
import { storageKeys } from "../storage/storageKeys";

interface SchedulerClockState {
  observedWallClock: number;
  logicalNow: number;
}

let processLogicalNow = 0;

/**
 * Returns a wall-clock-derived timestamp that never moves backwards in the
 * current browser profile. A clock rollback may temporarily hold the logical
 * clock until the wall clock catches up; it must never make cooldowns expire
 * early or revive an old lease.
 */
export function getSchedulerNow(wallClock = Date.now()): number {
  const safeWallClock = Number.isFinite(wallClock) ? wallClock : Date.now();
  const stored = readJson<unknown>(storageKeys.backgroundSchedulerClock, null);
  const previous = stored.valid && stored.value && typeof stored.value === "object"
    ? stored.value as Partial<SchedulerClockState>
    : undefined;
  const logicalNow = Math.max(
    safeWallClock,
    processLogicalNow,
    typeof previous?.logicalNow === "number" ? previous.logicalNow : 0,
  );
  processLogicalNow = logicalNow;
  if (typeof window !== "undefined" && window.localStorage) {
    writeJson(storageKeys.backgroundSchedulerClock, {
      observedWallClock: Math.max(
        safeWallClock,
        typeof previous?.observedWallClock === "number" ? previous.observedWallClock : 0,
      ),
      logicalNow,
    } satisfies SchedulerClockState);
  }
  return logicalNow;
}
