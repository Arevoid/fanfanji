import assert from "node:assert/strict";
import {
  appendCharacterEvents,
  deduplicateCharacterEvents,
  normalizeCharacterEvent,
  removeCharacterEventsByRelations,
} from "../src/domain/characterLife/eventPolicy";
import { findBySource, listByRelation } from "../src/core/storage/repositories/characterEventRepository";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";

const event = (id: string, relationId: string, userIdentityId: string, kind = "chat.fact"): CharacterEvent => ({
  id,
  relationId,
  characterId: "character-shared",
  userIdentityId,
  kind,
  summary: `${id} summary`,
  source: "chat",
  occurredAt: 100,
  recordedAt: 110,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
});

const relationA = event("event-a", "relation-a", "identity-a");
const relationB = event("event-b", "relation-b", "identity-b");
const isolated = appendCharacterEvents([], [relationA, relationB]);

assert.deepEqual(listByRelation("relation-a", isolated).map((item) => item.id), ["event-a"]);
assert.deepEqual(listByRelation("relation-b", isolated).map((item) => item.id), ["event-b"]);
assert.deepEqual(findBySource("chat", "relation-a", isolated).map((item) => item.id), ["event-a"]);
assert.deepEqual(findBySource("chat", "relation-b", isolated).map((item) => item.id), ["event-b"]);

const duplicate = appendCharacterEvents(isolated, [
  { ...relationA, id: "event-a-repeat", summary: "different summary" },
  { ...relationA, id: "event-a-repeat-2", kind: "chat.fact" },
]);
assert.equal(duplicate.length, 2, "relation/source/kind writes are idempotent");
assert.equal(deduplicateCharacterEvents([...isolated, relationA]).length, 2);

const removed = removeCharacterEventsByRelations(isolated, ["relation-a"]);
assert.deepEqual(removed.map((item) => item.id), ["event-b"]);

const legacy = normalizeCharacterEvent({
  id: "legacy-event",
  relationId: "relation-a",
  characterId: "character-shared",
  userIdentityId: "identity-a",
  kind: "offline.fact",
  summary: "legacy scoped event",
  source: "offline",
  occurredAt: 50,
});
assert.ok(legacy, "legacy records with scope remain readable");
assert.equal(legacy?.schemaVersion, 1);
assert.equal(legacy?.recordedAt, 50);
assert.equal(legacy?.status, "active");
assert.equal(legacy?.confidence, 1);

assert.equal(normalizeCharacterEvent({
  id: "unsafe-character-only",
  characterId: "character-shared",
  kind: "chat.fact",
  summary: "must not be assigned to a relation",
  source: "chat",
  occurredAt: 1,
}), undefined, "character-only legacy data cannot be scoped by guessing");

console.log("PASS CharacterEvent relation isolation, idempotency, cleanup, and legacy compatibility");
