import assert from "node:assert/strict";
import { BackgroundScheduler } from "../src/core/scheduler/backgroundScheduler";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let hidden = true;
let online = false;
const listeners = new Map<string, Set<() => void>>();
const add = (type: string, listener: () => void) => (listeners.get(type) || (listeners.set(type, new Set()), listeners.get(type)!)).add(listener);
const remove = (type: string, listener: () => void) => listeners.get(type)?.delete(listener);
const emit = (type: string) => listeners.get(type)?.forEach((listener) => listener());

Object.defineProperty(globalThis, "document", { value: { get hidden() { return hidden; }, addEventListener: add, removeEventListener: remove }, configurable: true });
Object.defineProperty(globalThis, "window", { value: { addEventListener: add, removeEventListener: remove }, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: { get onLine() { return online; } }, configurable: true });

let runs = 0;
const scheduler = new BackgroundScheduler({ id: "environment-test", initialDelayMs: 0, intervalMs: 1000, pauseWhenHidden: true, pauseWhenOffline: true, run: () => { runs += 1; } });
scheduler.start();
await wait(10);
assert.equal(runs, 0, "hidden/offline tasks must not execute");
hidden = false;
online = true;
emit("visibilitychange");
emit("online");
await wait(20);
assert.equal(runs, 1, "task should resume when visible and online");
scheduler.stop();
assert.equal(listeners.get("visibilitychange")?.size || 0, 0);
assert.equal(listeners.get("online")?.size || 0, 0);
assert.equal(listeners.get("pagehide")?.size || 0, 0);
assert.equal(listeners.get("pageshow")?.size || 0, 0);
console.log("PASS background scheduler pauses while hidden/offline and resumes safely");
