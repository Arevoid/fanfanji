import assert from "node:assert/strict";
import { BackgroundScheduler } from "../src/core/scheduler/backgroundScheduler";
import { loadPersistedBackgroundTaskSnapshots } from "../src/core/scheduler/schedulerTaskRepository";

const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
} as Storage;
const windowMock = {
  localStorage,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};
Object.assign(globalThis, { window: windowMock });

const originalDateNow = Date.now;
let logicalWallClock = 1_800_000_000_000;
Date.now = () => logicalWallClock;

let runs = 0;
let concurrent = 0;
let maxConcurrent = 0;
let sawSuccessfulReset = false;
const startedAt = logicalWallClock;
const scheduler = new BackgroundScheduler({
  id: "long-running-soak-task",
  initialDelayMs: 0,
  intervalMs: 0,
  leaseMs: 60_000,
  onState: (snapshot) => {
    if (snapshot.status === "success" && snapshot.attempts === 0) sawSuccessfulReset = true;
  },
  run: async () => {
    runs += 1;
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    // Simulate one hour of logical time per pass without waiting an hour in
    // the test process.
    logicalWallClock += 60 * 60 * 1000;
    await new Promise((resolve) => setTimeout(resolve, 0));
    concurrent -= 1;
  },
});

try {
  scheduler.start();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  scheduler.stop();
} finally {
  scheduler.stop();
  Date.now = originalDateNow;
}

assert.ok(runs >= 24, `expected at least 24 scheduler passes, got ${runs}`);
assert.equal(maxConcurrent, 1, "long-running passes must never overlap");
assert.ok(logicalWallClock - startedAt >= 24 * 60 * 60 * 1000, "soak must cover at least one logical day");
assert.equal(loadPersistedBackgroundTaskSnapshots().filter((snapshot) => snapshot.id === "long-running-soak-task").length, 1, "a long-running task keeps one bounded snapshot");
assert.equal(sawSuccessfulReset, true, "successful long-running passes reset retry attempts");

console.log(`PASS scheduler one-day logical soak: ${runs} serialized passes, one bounded snapshot`);
