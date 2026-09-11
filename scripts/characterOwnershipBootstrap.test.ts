import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexedDB } from "fake-indexeddb";
import { storageKeys } from "../src/core/storage/storageKeys";
import { createCharacterFromInput, normalizeCharacterOwnerIdentityId, validateCharacterOwnershipInput, type CharacterCreationInput } from "../src/domain/character/characterCreation";
import type { Character } from "../src/types";

const values = new Map<string, string>();
const localStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) { values.set(key, value); },
};
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage },
});

const baseInput: Omit<Character, "ownerIdentityId"> = {
  id: "character-ownership-test",
  name: "Ownership seam test",
  avatar: "avatar",
  personality: "stable",
  backstory: "",
  album: [],
  references: [],
};

const archivesSource = readFileSync(new URL("../src/components/AppArchives.tsx", import.meta.url), "utf8");
assert.match(archivesSource, /createCharacterFromInput\(/, "the ordinary archive form uses the shared creation seam");
assert.doesNotMatch(archivesSource, /ownerIdentityId:\s*(?:activeIdentity|settings|identity)/, "ordinary archive creation does not silently infer an owner");

assert.equal(normalizeCharacterOwnerIdentityId(" identity-canonical-1 "), "identity-canonical-1");
assert.equal(normalizeCharacterOwnerIdentityId("   "), undefined, "blank ownership is safely treated as absent");
assert.equal(normalizeCharacterOwnerIdentityId({}), undefined, "non-string ownership is safely rejected");
assert.deepEqual(validateCharacterOwnershipInput(undefined), { valid: true });
assert.equal(validateCharacterOwnershipInput(" ").valid, false, "blank ownership fails explicit input validation");
assert.equal(validateCharacterOwnershipInput(42).valid, false, "non-string ownership fails explicit input validation");

const owned = createCharacterFromInput({
  ...baseInput,
  ownerIdentityId: "identity-canonical-1",
});
assert.equal(owned.ownerIdentityId, "identity-canonical-1");
assert.equal(owned.name, baseInput.name);

const legacyCompatible = createCharacterFromInput(baseInput);
assert.equal("ownerIdentityId" in legacyCompatible, false, "omitted ownership remains legacy-compatible");

const malformed = createCharacterFromInput({
  ...baseInput,
  ownerIdentityId: "   ",
});
assert.equal("ownerIdentityId" in malformed, false, "malformed blank ownership is not persisted");
const malformedType = createCharacterFromInput({
  ...baseInput,
  ownerIdentityId: 42,
} as unknown as CharacterCreationInput);
assert.equal("ownerIdentityId" in malformedType, false, "malformed non-string ownership is not persisted");

const preservedOnEdit = createCharacterFromInput({
  ...owned,
  name: "Ownership seam edit",
});
assert.equal(preservedOnEdit.ownerIdentityId, owned.ownerIdentityId, "editing preserves explicit ownership");

const { saveCharacters, flushCharacters } = await import("../src/core/storage/repositories/characterRepository");
const { readingAssetDb } = await import("../src/core/storage/readingAssetDb");
assert.equal(saveCharacters([owned]).success, true);
assert.equal((await flushCharacters()).success, true);
const roundTrip = await readingAssetDb.loadMetadataValue<Character[]>("character-archive-v4");
assert.equal(roundTrip?.[0]?.ownerIdentityId, owned.ownerIdentityId, "IndexedDB round-trip preserves canonical ownership exactly");

for (const key of [
  storageKeys.characterRelationships,
  storageKeys.messages,
  storageKeys.legacyMessages,
  storageKeys.memoryVaultItems,
  storageKeys.relationshipNetworkNpcs,
  storageKeys.relationshipNetworkChatLinks,
]) {
  assert.equal(localStorage.getItem(key), null, `character creation must not write side-effect store ${key}`);
}

console.log("character ownership bootstrap seam tests passed");
