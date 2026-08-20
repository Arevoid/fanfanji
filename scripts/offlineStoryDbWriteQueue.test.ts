import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import type { OfflineStory } from "../src/types";

Object.assign(globalThis, { indexedDB });

const { offlineStoryDb } = await import("../src/core/storage/offlineStoryDb");

const story = (id: string, updatedAt: number, title = id): OfflineStory => ({
  id,
  characterId: `character-${id}`,
  title,
  createdAt: updatedAt,
  updatedAt,
  mode: "director",
  messages: [],
});

await offlineStoryDb.clearAll();

const initial = story("initial", 1);
const replacement = story("replacement", 2);
const latestReplacement = story("replacement", 3, "latest");

// These calls intentionally overlap. The final state must follow invocation
// order: save -> replaceAll -> save, rather than whichever IDB transaction
// happens to finish first.
await Promise.all([
  offlineStoryDb.save(initial),
  offlineStoryDb.replaceAll([replacement]),
  offlineStoryDb.save(latestReplacement),
]);

assert.deepEqual(await offlineStoryDb.loadAll(), [latestReplacement]);

await Promise.all([
  offlineStoryDb.delete(latestReplacement.id),
  offlineStoryDb.save(story("kept", 4)),
]);
assert.deepEqual(await offlineStoryDb.loadAll(), [story("kept", 4)]);

console.log("offline story IndexedDB write queue tests passed");
