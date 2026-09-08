import assert from "node:assert/strict";
import { BackgroundScheduler } from "../src/core/scheduler/backgroundScheduler";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let runs = 0;
let concurrent = 0;
let maxConcurrent = 0;
const states: string[] = [];
const scheduler = new BackgroundScheduler({
  id: "test-task",
  initialDelayMs: 0,
  intervalMs: 5,
  run: async () => {
    runs += 1;
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await wait(12);
    concurrent -= 1;
  },
  onState: (snapshot) => states.push(snapshot.status),
});
scheduler.start();
await wait(80);
scheduler.stop();
assert.ok(runs >= 2);
assert.equal(maxConcurrent, 1);
assert.ok(["success", "cancelled"].includes(scheduler.getSnapshot().status));
assert.ok(states.includes("running"));
assert.ok(states.includes("success") || states.includes("cancelled"));

const failing = new BackgroundScheduler({ id: "failing-task", initialDelayMs: 0, intervalMs: 5, maxAttempts: 1, run: () => { throw new Error("expected"); } });
failing.start();
await wait(15);
failing.stop();
assert.equal(failing.getSnapshot().status, "expired");

let releaseCancellationRun: (() => void) | null = null;
const cancellationRun = new BackgroundScheduler({
  id: "cancellation-task",
  initialDelayMs: 0,
  intervalMs: 5,
  run: () => new Promise<void>((resolve) => { releaseCancellationRun = resolve; }),
});
cancellationRun.start();
await wait(5);
cancellationRun.stop();
releaseCancellationRun?.();
await wait(5);
assert.equal(cancellationRun.getSnapshot().status, "cancelled");
console.log("PASS background scheduler serializes work, recovers timers, expires repeated failures, and cancels in-flight work");
