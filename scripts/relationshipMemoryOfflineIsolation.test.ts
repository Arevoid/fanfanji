import assert from "node:assert/strict";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { createStableRelationId } from "../src/domain/relationship/relationshipService";
import type { MemoryItem, OfflineStory } from "../src/types";

const characterId = "char-qiche";
const relationA = createStableRelationId(characterId, "identity-lily");
const relationB = createStableRelationId(characterId, "identity-fanfan");
const defaultRelation = createStableRelationId(characterId, "identity-1");
const memories: MemoryItem[] = [
  { id: "a", characterId, relationId: relationA, content: "小梨花和祁澈喜欢蜂蜜水", timestamp: 1 },
  { id: "b", characterId, relationId: relationB, content: "饭饭和祁澈计划旅行", timestamp: 2 },
  { id: "legacy", characterId, content: "历史默认关系记忆", timestamp: 3 },
];

const retrieve = (relationId: string) => MemoryService.retrieveRelevantMemories({
  characterId,
  relationId,
  queryText: "",
  existingMemories: memories,
  scenario: "offline",
});

assert.deepEqual(retrieve(relationA).map((memory) => memory.id), ["a"]);
assert.deepEqual(retrieve(relationB).map((memory) => memory.id), ["b"]);
assert.deepEqual(retrieve(defaultRelation).map((memory) => memory.id), ["legacy"]);

const stories: OfflineStory[] = [
  { id: "story-a", characterId, relationId: relationA, title: "A", createdAt: 1, updatedAt: 1, mode: "director", messages: [] },
  { id: "story-b", characterId, relationId: relationB, title: "B", createdAt: 1, updatedAt: 1, mode: "director", messages: [] },
  { id: "legacy-story", characterId, title: "Legacy", createdAt: 1, updatedAt: 1, mode: "director", messages: [] },
];

assert.deepEqual(stories.filter((story) => story.relationId === relationA).map((story) => story.id), ["story-a"]);
assert.deepEqual(stories.filter((story) => story.relationId === relationB).map((story) => story.id), ["story-b"]);
assert.equal(stories.find((story) => !story.relationId)?.id, "legacy-story");

console.log("PASS relation-scoped memories and offline stories remain isolated");
