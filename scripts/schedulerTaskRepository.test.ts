import assert from "node:assert/strict";
import { loadPersistedBackgroundTaskSnapshots, loadRecoverableBackgroundTaskSnapshots, savePersistedBackgroundTaskSnapshot } from "../src/core/scheduler/schedulerTaskRepository";

const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
} as Storage;
Object.assign(globalThis, { window: { localStorage } });

assert.equal(savePersistedBackgroundTaskSnapshot({ id: "task-a", status: "success", attempts: 0, maxAttempts: 3, taskType: "proactive-chat", reason: "scheduled-catchup", metadata: { relationId: "r1" } }), true);
assert.deepEqual(loadPersistedBackgroundTaskSnapshots().map((task) => task.id), ["task-a"]);
assert.equal(savePersistedBackgroundTaskSnapshot({ id: "task-a", status: "failed", attempts: 1, maxAttempts: 3, lastError: "网络错误" }), true);
assert.deepEqual(loadPersistedBackgroundTaskSnapshots(), [{ id: "task-a", status: "failed", attempts: 1, maxAttempts: 3, lastError: "网络错误" }]);
assert.equal(loadRecoverableBackgroundTaskSnapshots().length, 1);
assert.equal(savePersistedBackgroundTaskSnapshot({ id: "task-rejected", status: "failed", attempts: 1, maxAttempts: 3, userRejected: true }), true);
assert.equal(loadRecoverableBackgroundTaskSnapshots().some((task) => task.id === "task-rejected"), false);
console.log("PASS scheduler status persistence stores metadata without task payloads");
