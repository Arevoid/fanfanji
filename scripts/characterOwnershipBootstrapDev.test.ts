import assert from "node:assert/strict";
import { createCharacterOwnershipBootstrapApi } from "../src/features/archives/characterOwnershipBootstrapDev";
import type { Character, UserIdentity, UserSettings } from "../src/types";

const syntheticIdentity: UserIdentity = {
  id: "synthetic-identity-canonical",
  name: "Synthetic Identity",
  avatar: "synthetic-avatar",
  signature: "",
  bio: "仅用于本地开发证据验证的合成身份，不代表真实用户。",
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
