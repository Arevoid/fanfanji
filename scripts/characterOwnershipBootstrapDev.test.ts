import assert from "node:assert/strict";
import {
  createCharacterOwnershipBootstrapApi,
  SYNTHETIC_IDENTITY_BIO,
} from "../src/features/archives/characterOwnershipBootstrapDev";
import type { Character, UserIdentity, UserSettings } from "../src/types";

const syntheticIdentity: UserIdentity = {
  id: "synthetic-identity-canonical",
  name: "Synthetic Identity",
  avatar: "synthetic-avatar",
  signature: "",
  bio: SYNTHETIC_IDENTITY_BIO,
  kind: "primary",
};

const settings = { identities: [syntheticIdentity] } as UserSettings;
let characters: Character[] = [];

const api = createCharacterOwnershipBootstrapApi({
  getSettings: () => settings,
  getCharacters: () => characters,
  saveCharacter: async (character) => {
    characters = [...characters, character];
    return true;
  },
  readCharacters: () => characters,
});

const result = await api.bootstrap();
assert.equal(result.status, "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED");
assert.equal(result.characterCountBefore, 0);
assert.equal(result.characterCountAfter, 1);
assert.equal(result.ownerExact, true);
assert.equal(result.summaryTriggerRound, 10);
assert.equal(result.evidenceMode, "mechanism_characterization");
assert.equal(result.defaultBehaviorRepresentative, false);
assert.ok(result.identityFingerprint);
assert.ok(result.characterFingerprint);
assert.ok(!result.identityFingerprint.includes(syntheticIdentity.id));
assert.ok(!result.characterFingerprint.includes(characters[0].id));
assert.equal(characters[0].ownerIdentityId, syntheticIdentity.id);
assert.equal(characters[0].isGroupChat, false);
assert.equal(characters[0].isContactInstance, false);
assert.equal(characters[0].greeting, undefined);
assert.equal(characters[0].initialChatContext, undefined);

const duplicateAttempt = await api.bootstrap();
assert.equal(duplicateAttempt.status, "OWNED_CHARACTER_RUNTIME_BOOTSTRAP_BLOCKED");
assert.equal(characters.length, 1);

const inspected = await api.inspect();
assert.equal(inspected.status, "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED");
assert.equal(inspected.characterCountAfter, 1);
assert.equal(inspected.ownerExact, true);
assert.equal(inspected.summaryTriggerRound, 10);

const missingIdentityApi = createCharacterOwnershipBootstrapApi({
  getSettings: () => ({ identities: [] } as UserSettings),
  getCharacters: () => [],
  saveCharacter: async () => {
    throw new Error("save must not be called without an exact identity");
  },
  readCharacters: () => [],
});
const missingIdentityResult = await missingIdentityApi.bootstrap();
assert.equal(missingIdentityResult.status, "OWNED_CHARACTER_IDENTITY_CONTEXT_BLOCKED");

console.log("PASS dev-only owned Character bootstrap validates explicit identity ownership, persistence readback, privacy fingerprints, and one-shot guard");

const portableIdentity: UserIdentity = {
  id: "portable-identity-canonical",
  name: "Stage4D3Portable User",
  avatar: "portable-avatar",
  signature: "",
  bio: SYNTHETIC_IDENTITY_BIO,
  kind: "primary",
  syntheticFixtureId: "stage4d3-portable",
};
const legacyCharacter = { ...characters[0], id: "legacy-character", ownerIdentityId: syntheticIdentity.id };
let coexistCharacters: Character[] = [legacyCharacter];
const coexistApi = createCharacterOwnershipBootstrapApi({
  getSettings: () => ({ identities: [syntheticIdentity, portableIdentity] } as UserSettings),
  getCharacters: () => coexistCharacters,
  saveCharacter: async (next) => { coexistCharacters = [...coexistCharacters, next]; return true; },
  readCharacters: () => coexistCharacters,
});
const coexistBefore = structuredClone(legacyCharacter);
const portableResult = await coexistApi.bootstrap({ fixtureId: "stage4d3-portable", identityId: portableIdentity.id, characterName: "Stage4D3Portable Character" });
assert.equal(portableResult.status, "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED");
assert.deepEqual(coexistCharacters.find((candidate) => candidate.id === legacyCharacter.id), coexistBefore);
assert.equal(coexistCharacters.filter((candidate) => candidate.syntheticFixtureId === "stage4d3-portable").length, 1);
assert.equal((await coexistApi.inspect({ fixtureId: "stage4d3-portable", identityId: portableIdentity.id })).ownerExact, true);

console.log("PASS synthetic fixture namespaces coexist without mutating legacy Character ownership");
