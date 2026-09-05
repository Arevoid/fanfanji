import assert from "node:assert/strict";
import { loadRecoverableBackgroundTaskSnapshots, savePersistedBackgroundTaskSnapshot } from "../src/core/scheduler/schedulerTaskRepository";

const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
} as Storage;
Object.assign(globalThis, { window: { localStorage } });

savePersistedBackgroundTaskSnapshot({
  id: "refreshable-task",
  status: "running",
  attempts: 1,
  maxAttempts: 3,
  taskType: "proactive-chat-background",
  recoveryPayload: { scope: "active-identity", identityId: "identity-a" },
});
const recovered = loadRecoverableBackgroundTaskSnapshots(10_000);
assert.equal(recovered.length, 1, "a running task survives a page refresh as recoverable work");
assert.deepEqual(recovered[0].recoveryPayload, { scope: "active-identity", identityId: "identity-a" });

savePersistedBackgroundTaskSnapshot({
  id: "closed-task",
  status: "cancelled",
  attempts: 1,
  maxAttempts: 3,
  taskType: "proactive-chat-background",
});
assert.equal(loadRecoverableBackgroundTaskSnapshots(10_000).some((snapshot) => snapshot.id === "closed-task"), false, "a deliberately cancelled task is not revived after close");
console.log("PASS scheduler distinguishes refresh recovery from deliberate cancellation");
