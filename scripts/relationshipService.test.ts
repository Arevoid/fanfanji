import assert from "node:assert/strict";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

Object.defineProperty(globalThis, "window", {
  value: { localStorage: new MemoryStorage() },
  configurable: true,
});

const {
  getOrCreateRelationship,
  listRelationshipsByCharacter,
  resolveRelationId,
  materializeLegacyContactRelationships,
  deleteRelationshipById,
  deleteRelationshipsByCharacter,
  isRelationshipScopedRecord,
} = await import("../src/domain/relationship/relationshipService");

const first = getOrCreateRelationship("char_001", "identity-lily", 100);
const repeated = getOrCreateRelationship("char_001", "identity-lily", 200);
const second = getOrCreateRelationship("char_001", "identity-fanfan", 300);

assert.equal(first.id, repeated.id, "same identity must reuse its relationship id");
assert.notEqual(first.id, second.id, "different identities must receive separate relationship ids");
assert.equal(listRelationshipsByCharacter("char_001").length, 2);

const legacyContact = {
  id: "contact-identity-lily-1",
  profileSourceId: "char_001",
  ownerIdentityId: "identity-lily",
};
assert.equal(
  resolveRelationId(legacyContact),
  first.id,
  "legacy contact must resolve through profileSourceId to the canonical character relationship",
);

const materialized = materializeLegacyContactRelationships([
  legacyContact,
  { id: "contact-identity-fanfan-1", profileSourceId: "char_001", ownerIdentityId: "identity-fanfan" },
], 400);
assert.equal(materialized.length, 2, "legacy materialization must preserve one relationship per identity");
assert.equal(deleteRelationshipById(first.id).success, true);
assert.equal(listRelationshipsByCharacter("char_001").map((item) => item.id).includes(first.id), false, "contact deletion must remove only its own relation");
assert.equal(listRelationshipsByCharacter("char_001").map((item) => item.id).includes(second.id), true, "contact deletion must not remove another identity relation");
assert.equal(isRelationshipScopedRecord(
  { characterId: "contact-lily", relationId: first.id },
  { characterIds: ["contact-lily"], relationIds: [first.id] },
), true);
assert.equal(isRelationshipScopedRecord(
  { characterId: "contact-fanfan", relationId: second.id },
  { characterIds: ["contact-lily"], relationIds: [first.id] },
), false);
assert.equal(deleteRelationshipsByCharacter("char_001").success, true);
assert.equal(listRelationshipsByCharacter("char_001").length, 0, "character cleanup must remove every relation");

console.log("PASS relationship ids are stable per canonical character + user identity");
