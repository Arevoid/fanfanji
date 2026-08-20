import assert from "node:assert/strict";
import { BackgroundScheduler } from "../src/core/scheduler/backgroundScheduler";
import { registerBackgroundTaskFactory, restoreBackgroundSchedulers } from "../src/core/scheduler/schedulerRegistry";
import { savePersistedBackgroundTaskSnapshot } from "../src/core/scheduler/schedulerTaskRepository";

const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
} as Storage;
Object.assign(globalThis, { window: { localStorage } });

savePersistedBackgroundTaskSnapshot({ id: "recover-me", status: "failed", attempts: 1, maxAttempts: 3, taskType: "test-recovery", metadata: { relationId: "r1" }, recoveryPayload: { relationId: "r1", memberIds: ["c1", "c2"] } });
savePersistedBackgroundTaskSnapshot({ id: "unknown", status: "failed", attempts: 1, maxAttempts: 3, taskType: "unknown" });
const unregister = registerBackgroundTaskFactory("test-recovery", (snapshot) => ({
  id: snapshot.id,
  intervalMs: 1000,
  run: () => undefined,
  taskType: "test-recovery",
}));
const restored = restoreBackgroundSchedulers();
assert.equal(restored.length, 1);
assert.ok(restored[0] instanceof BackgroundScheduler);
assert.equal(restored[0].getSnapshot().id, "recover-me");
assert.equal(restored[0].getSnapshot().attempts, 1);
assert.deepEqual(restored[0].getSnapshot().metadata, { relationId: "r1" });
assert.deepEqual(restored[0].getSnapshot().recoveryPayload, { relationId: "r1", memberIds: ["c1", "c2"] });
unregister();

const firstFactory = registerBackgroundTaskFactory("shared-task", (snapshot) => snapshot.id === "shared-a" ? {
  id: snapshot.id,
  intervalMs: 1000,
  run: () => undefined,
  taskType: "shared-task",
} : null);
const secondFactory = registerBackgroundTaskFactory("shared-task", (snapshot) => snapshot.id === "shared-b" ? {
  id: snapshot.id,
  intervalMs: 1000,
  run: () => undefined,
  taskType: "shared-task",
} : null);
savePersistedBackgroundTaskSnapshot({ id: "shared-a", status: "failed", attempts: 1, maxAttempts: 3, taskType: "shared-task" });
savePersistedBackgroundTaskSnapshot({ id: "shared-b", status: "failed", attempts: 1, maxAttempts: 3, taskType: "shared-task" });
assert.deepEqual(restoreBackgroundSchedulers().map((scheduler) => scheduler.getSnapshot().id).sort(), ["shared-a", "shared-b"]);
firstFactory();
assert.deepEqual(restoreBackgroundSchedulers().map((scheduler) => scheduler.getSnapshot().id), ["shared-b"]);
secondFactory();
console.log("PASS scheduler registry reconstructs known recoverable tasks with safe descriptors");
