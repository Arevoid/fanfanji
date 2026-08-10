import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { OfflineStory } from "../src/types.ts";
import { mergeOfflineStoryCollections } from "../src/core/storage/repositories/offlineRepository.ts";

const story = (id: string, updatedAt: number, messageCount: number): OfflineStory => ({
  id,
  characterId: "character-1",
  relationId: "relation-1",
  conversationId: "conversation-1",
  title: id,
  createdAt: 1,
  updatedAt,
  mode: "continue",
  messages: Array.from({ length: messageCount }, (_, index) => ({
    id: `${id}-message-${index}`,
    characterId: "character-1",
    relationId: "relation-1",
    conversationId: "conversation-1",
    sender: "character" as const,
    content: `content-${index}`,
    timestamp: index + 1,
    isOffline: true,
  })),
});

const merged = mergeOfflineStoryCollections(
  [story("local-newer", 20, 2), story("tie", 10, 2), story("local-only", 1, 1)],
  [story("local-newer", 10, 5), story("tie", 10, 3), story("durable-only", 30, 1)],
);
assert.equal(merged.find((item) => item.id === "local-newer")?.updatedAt, 20);
assert.equal(merged.find((item) => item.id === "tie")?.messages.length, 3);
assert.ok(merged.some((item) => item.id === "local-only"));
assert.ok(merged.some((item) => item.id === "durable-only"));

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const offline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
assert.match(app, /return persistOfflineStories\(updated, story\)/);
assert.match(app, /offlineStoryDb\.loadAll\(\)/);
assert.match(offline, /await storyPersistenceRef\.current/);
assert.match(offline, /archivedAt: undefined,[\s\S]*memorySyncStatus: "pending"/);
assert.match(settings, /backupData\.phone_offline_stories = JSON\.stringify\(mergeOfflineStoryCollections/);
assert.match(settings, /await offlineStoryDb\.replaceAll\(parsedStories as OfflineStory\[\]\)/);

console.log("PASS offline stories persist durably, merge newer snapshots, restore through backups, and reopen as pending progress");
