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
Object.assign(globalThis, { window: { localStorage, addEventListener: () => undefined, removeEventListener: () => undefined } });

const scheduler = new BackgroundScheduler({
  id: "descriptor-update-test",
  intervalMs: 60_000,
  run: () => undefined,
  metadata: { identity: "before" },
  recoveryPayload: { scope: "before" },
});
scheduler.start();
scheduler.updateDescriptor({
  reason: "updated-reason",
  cooldownUntil: 123,
  userRejected: true,
  metadata: { identity: "after" },
  recoveryPayload: { scope: "after" },
});

const snapshot = loadPersistedBackgroundTaskSnapshots().find((entry) => entry.id === "descriptor-update-test");
assert.ok(snapshot);
assert.equal(snapshot.reason, "updated-reason");
assert.equal(snapshot.cooldownUntil, 123);
assert.equal(snapshot.userRejected, true);
assert.deepEqual(snapshot.metadata, { identity: "after" });
assert.deepEqual(snapshot.recoveryPayload, { scope: "after" });
assert.equal(scheduler.getSnapshot().status, "pending");
scheduler.stop();

console.log("PASS scheduler descriptor updates persist metadata without restarting the active timer");
