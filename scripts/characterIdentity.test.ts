import assert from "node:assert/strict";
import {
  getAvailableCanonicalCharacterIds,
  pruneUnavailableCharacterRelations,
  resolveCanonicalCharacterIds,
} from "../src/domain/character/characterIdentity";
import type { Character } from "../src/types";

const archiveCharacter: Character = { id: "yang-cheng", name: "杨丞", avatar: "archive.png", personality: "稳重", backstory: "邻居" };
const legacyContact: Character = {
  ...archiveCharacter,
  id: "contact-identity-1-old",
  isContactInstance: true,
  profileSourceId: archiveCharacter.id,
};

const canonical = resolveCanonicalCharacterIds([legacyContact.id, archiveCharacter.id], [archiveCharacter, legacyContact]);
assert.deepEqual([...canonical], [archiveCharacter.id]);
assert.deepEqual([...resolveCanonicalCharacterIds([archiveCharacter.id], [archiveCharacter])], [archiveCharacter.id]);
assert.deepEqual(
  pruneUnavailableCharacterRelations([legacyContact.id], [archiveCharacter, legacyContact]),
  [legacyContact.id],
  "a legacy contact resolves to its still-existing archive profile",
);
assert.equal(
  getAvailableCanonicalCharacterIds([legacyContact]).has(archiveCharacter.id),
  false,
  "a contact copy cannot become an independent canonical character",
);
assert.deepEqual(
  pruneUnavailableCharacterRelations([legacyContact.id], [legacyContact]),
  [],
  "deleting the archive profile releases the stale friend relation without deleting history",
);
const sameNameDifferentId: Character = { ...archiveCharacter, id: "yang-cheng-2" };
assert.deepEqual(
  [...getAvailableCanonicalCharacterIds([archiveCharacter, sameNameDifferentId])],
  [archiveCharacter.id, sameNameDifferentId.id],
  "same-name characters with different IDs remain distinct",
);
console.log("PASS canonical identity, stale relation cleanup, and same-name preservation");
