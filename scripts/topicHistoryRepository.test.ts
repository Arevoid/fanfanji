import assert from "node:assert/strict";
import { storageKeys } from "../src/core/storage/storageKeys";
import {
  appendMomentTopicRecord,
  loadMomentTopicRecords,
  removeMomentTopicsForCharacters,
  removeMomentTopicsForMoments,
} from "../src/core/storage/repositories/momentTopicRepository";
import {
  appendProactiveTopicRecord,
  loadProactiveTopicRecords,
  removeProactiveTopicsForRelations,
} from "../src/core/storage/repositories/proactiveTopicRepository";
import { createMomentTopicRecord } from "../src/domain/moments/momentGeneration/momentTopicHistory";
import { createProactiveTopicRecord } from "../src/domain/characterLife/proactive/proactiveTopicHistory";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  clear: () => { values.clear(); },
  key: (index: number) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
(globalThis as typeof globalThis & { window?: Window }).window = { localStorage } as Window & typeof globalThis;

const momentA = createMomentTopicRecord({
  topic: "Character A public topic",
  category: "daily_life",
  generatedAt: 100,
  momentId: "moment-a",
  characterId: "character-a",
});
const momentB = createMomentTopicRecord({
  topic: "Character B public topic",
  category: "hobby",
  generatedAt: 101,
  momentId: "moment-b",
  characterId: "character-b",
});
assert.ok(momentA && momentB);
assert.equal(appendMomentTopicRecord(momentA).success, true);
assert.equal(appendMomentTopicRecord(momentA).success, true, "duplicate appends remain idempotent");
assert.equal(appendMomentTopicRecord(momentB).success, true);
assert.equal(loadMomentTopicRecords().value.length, 2);
assert.equal(loadMomentTopicRecords().value.every((record) => record.scope === "character-public"), true);
assert.equal(new Set(loadMomentTopicRecords().value.map((record) => record.characterId)).size, 2);
assert.equal(removeMomentTopicsForCharacters(["character-a"]).success, true);
assert.deepEqual(loadMomentTopicRecords().value.map((record) => record.characterId), ["character-b"]);
assert.equal(removeMomentTopicsForMoments(["moment-b"]).success, true);
assert.equal(loadMomentTopicRecords().value.length, 0);

const proactiveA1 = createProactiveTopicRecord({
  topic: "Relation A topic",
  category: "care",
  createdAt: 200,
  characterId: "character-a",
  relationId: "relation-a1",
});
const proactiveA2 = createProactiveTopicRecord({
  topic: "Relation A2 topic",
  category: "daily_share",
  createdAt: 201,
  characterId: "character-a",
  relationId: "relation-a2",
});
assert.ok(proactiveA1 && proactiveA2);
assert.equal(appendProactiveTopicRecord(proactiveA1).success, true);
assert.equal(appendProactiveTopicRecord(proactiveA1).success, true);
assert.equal(appendProactiveTopicRecord(proactiveA2).success, true);
assert.equal(loadProactiveTopicRecords().value.length, 2);
assert.equal(removeProactiveTopicsForRelations(["relation-a1"]).success, true);
assert.deepEqual(loadProactiveTopicRecords().value.map((record) => record.relationId), ["relation-a2"]);
assert.equal(loadProactiveTopicRecords().value[0]?.characterId, "character-a");

values.set(storageKeys.momentTopicHistory, JSON.stringify([
  { topic: "valid", category: "other", generatedAt: 1, momentId: "m", characterId: "c", scope: "wrong" },
  { topic: "valid", category: "other", generatedAt: 2, momentId: "m2", characterId: "c", scope: "character-public" },
]));
assert.deepEqual(loadMomentTopicRecords().value.map((record) => record.momentId), ["m2"]);

console.log("PASS topic history repositories persist, dedupe, normalize, clean up, and preserve character/relation isolation");
