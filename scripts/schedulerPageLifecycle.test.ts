import assert from "node:assert/strict";
import { BackgroundScheduler } from "../src/core/scheduler/backgroundScheduler";
import { loadRecoverableBackgroundTaskSnapshots } from "../src/core/scheduler/schedulerTaskRepository";

const values = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
} as Storage;
const windowMock = {
  localStorage,
  addEventListener: (type: string, listener: () => void) => (listeners.get(type) || (listeners.set(type, new Set()), listeners.get(type)!)).add(listener),
  removeEventListener: (type: string, listener: () => void) => listeners.get(type)?.delete(listener),
};
Object.assign(globalThis, { window: windowMock });

let runs = 0;
const scheduler = new BackgroundScheduler({ id: "page-lifecycle-task", initialDelayMs: 1000, intervalMs: 1000, run: () => { runs += 1; } });
scheduler.start();
const pageHide = [...(listeners.get("pagehide") || [])][0];
const pageShow = [...(listeners.get("pageshow") || [])][0];
assert.ok(pageHide && pageShow);
pageHide();
assert.ok(loadRecoverableBackgroundTaskSnapshots(10_000).some((snapshot) => snapshot.id === "page-lifecycle-task"), "pagehide keeps a task recoverable");
const beforeShow = runs;
pageShow();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.ok(runs > beforeShow, "pageshow schedules the task again");
scheduler.stop();
console.log("PASS scheduler preserves recoverability across pagehide and resumes on pageshow");
