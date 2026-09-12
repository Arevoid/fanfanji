import assert from "node:assert/strict";
import {
  createMultiScopeFixtureApi,
  MULTI_SCOPE_FIXTURE_IDS,
} from "../src/features/archives/multiScopeFixtureDev";
import {
  SYNTHETIC_IDENTITY_BIO,
  type CharacterOwnershipBootstrapOptions,
  type CharacterOwnershipBootstrapResult,
} from "../src/features/archives/characterOwnershipBootstrapDev";
import type {
  DedicatedRelationBootstrapOptions,
  DedicatedRelationInspectorResult,
} from "../src/features/archives/dedicatedRelationBootstrapDev";
import type { Character, UserIdentity, UserSettings } from "../src/types";

const legacyIdentity: UserIdentity = {
  id: "legacy-multiscope-identity",
  name: "Existing Synthetic Identity",
  avatar: "",
  signature: "",
  bio: SYNTHETIC_IDENTITY_BIO,
  kind: "primary",
};

let settings = {
  name: "Default",
  avatar: "",
  signature: "",
  bio: "",
  apiKey: "",
  selectedModel: "",
  wallpaper: "",
  customIcons: {},
  bubbleCss: "",
  globalCss: "",
  identities: [legacyIdentity],
  activeIdentityId: legacyIdentity.id,
  identityDataVersion: 2,
} as UserSettings;

const characters: Character[] = [];
const relations = new Map<string, { id: string; conversationId: string; identityId: string; characterId: string }>();
const scopedMessageCounts = new Map<string, number>([
  ["stage4d3-portable-a", 2],
  ["stage4d3-portable-b", 1],
  ["stage4d3-portable-c", 0],
]);

const blockedCharacter = (status: CharacterOwnershipBootstrapResult["status"]): CharacterOwnershipBootstrapResult => ({
  status,
  identityFingerprint: null,
  characterFingerprint: null,
  characterCountBefore: characters.length,
  characterCountAfter: characters.length,
  ownerExact: false,
  summaryTriggerRound: null,
  evidenceMode: "mechanism_characterization",
  defaultBehaviorRepresentative: false,
});

const characterResult = (fixtureId: string, identityId: string, character: Character): CharacterOwnershipBootstrapResult => ({
  status: "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED",
  identityFingerprint: `identity-fp-${fixtureId}-${identityId}`,
  characterFingerprint: `character-fp-${fixtureId}`,
  characterCountBefore: characters.length,
  characterCountAfter: characters.length,
  ownerExact: character.ownerIdentityId === identityId,
  summaryTriggerRound: character.summaryTriggerRound ?? null,
  evidenceMode: "mechanism_characterization",
  defaultBehaviorRepresentative: false,
});

const bootstrapCharacter = async (options?: CharacterOwnershipBootstrapOptions): Promise<CharacterOwnershipBootstrapResult> => {
  const fixtureId = options?.fixtureId;
  const identityId = options?.identityId;
  if (!fixtureId || !identityId) return blockedCharacter("OWNED_CHARACTER_IDENTITY_CONTEXT_BLOCKED");
  const existing = characters.find((candidate) => candidate.syntheticFixtureId === fixtureId);
  if (existing) return characterResult(fixtureId, identityId, existing);
  const character: Character = {
    id: `character-${fixtureId}`,
    syntheticFixtureId: fixtureId,
    ownerIdentityId: identityId,
    name: options.characterName || `${fixtureId} Character`,
    avatar: "",
    personality: "synthetic",
    backstory: "",
    summaryTriggerRound: 10,
    isGroupChat: false,
    isContactInstance: false,
  };
  characters.push(character);
  return characterResult(fixtureId, identityId, character);
};

const inspectCharacter = async (options?: CharacterOwnershipBootstrapOptions): Promise<CharacterOwnershipBootstrapResult> => {
  const fixtureId = options?.fixtureId;
  const identityId = options?.identityId;
  const character = fixtureId && characters.find((candidate) => candidate.syntheticFixtureId === fixtureId);
  if (!fixtureId || !identityId || !character || character.ownerIdentityId !== identityId) {
    return blockedCharacter("OWNED_CHARACTER_RUNTIME_BOOTSTRAP_BLOCKED");
  }
  return characterResult(fixtureId, identityId, character);
};

const blockedRelation = (fixtureId = "stage4d11o-dedicated-direct"): DedicatedRelationInspectorResult => ({
  status: "DEDICATED_FIXTURE_INSPECTOR_BLOCKED",
  fixtureId,
  lifecycleState: "character_bootstrapped",
  exactScopeHealth: false,
  eligibleMessageCount: 0,
  triggerCount: 20,
  distanceToTrigger: 20,
  archiveMarkerPresent: false,
  archiveMarkerFoundInLoadedScope: false,
  exactPendingRange: false,
  inFlight: false,
  cooldownActive: false,
  isGroup: false,
  isOffline: false,
  nextTurnTriggers: false,
  identityFingerprint: null,
  characterFingerprint: null,
  relationFingerprint: null,
  conversationFingerprint: null,
});

const relationResult = (fixtureId: string, relation: { id: string; conversationId: string }): DedicatedRelationInspectorResult => {
  const eligibleMessageCount = scopedMessageCounts.get(fixtureId) ?? 0;
  return {
    status: "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED",
    fixtureId,
    lifecycleState: "ready",
    exactScopeHealth: true,
    eligibleMessageCount,
    triggerCount: 20,
    distanceToTrigger: Math.max(0, 20 - eligibleMessageCount),
    archiveMarkerPresent: false,
    archiveMarkerFoundInLoadedScope: false,
    exactPendingRange: true,
    inFlight: false,
    cooldownActive: false,
    isGroup: false,
    isOffline: false,
    nextTurnTriggers: false,
    identityFingerprint: `identity-fp-${fixtureId}`,
    characterFingerprint: `character-fp-${fixtureId}`,
    relationFingerprint: `relation-fp-${fixtureId}`,
    conversationFingerprint: `conversation-fp-${fixtureId}`,
  };
};

const bootstrapRelation = async (options?: DedicatedRelationBootstrapOptions): Promise<DedicatedRelationInspectorResult> => {
  const fixtureId = options?.fixtureId;
  const identityId = options?.identityId;
  const character = fixtureId && characters.find((candidate) => candidate.syntheticFixtureId === fixtureId);
  if (!fixtureId || !identityId || !character || character.ownerIdentityId !== identityId) return blockedRelation(fixtureId);
  let relation = relations.get(fixtureId);
  if (!relation) {
    relation = {
      id: `relation-${fixtureId}`,
      conversationId: `conversation-${fixtureId}`,
      identityId,
      characterId: character.id,
    };
    relations.set(fixtureId, relation);
  }
  return relationResult(fixtureId, relation);
};

const inspectRelation = async (options?: DedicatedRelationBootstrapOptions): Promise<DedicatedRelationInspectorResult> => {
  const fixtureId = options?.fixtureId;
  const identityId = options?.identityId;
  const relation = fixtureId && relations.get(fixtureId);
  if (!fixtureId || !identityId || !relation || relation.identityId !== identityId) return blockedRelation(fixtureId);
  return relationResult(fixtureId, relation);
};

const api = createMultiScopeFixtureApi({
  getSettings: () => settings,
  saveSettings: (update) => {
    settings = update(settings);
    return true;
  },
  bootstrapCharacter,
  inspectCharacter,
  bootstrapRelation,
  inspectRelation,
});

const invalid = await api.bootstrap({ fixtureId: "stage4d3-portable-invalid" as never });
assert.equal(invalid.status, "MULTI_SCOPE_FIXTURE_ID_INVALID");
assert.equal(settings.identities?.length, 1);
assert.equal(characters.length, 0);
assert.equal(relations.size, 0);

const results = [] as Awaited<ReturnType<typeof api.bootstrap>>[];
for (const fixtureId of MULTI_SCOPE_FIXTURE_IDS) {
  const result = await api.bootstrap({ fixtureId });
  assert.equal(result.status, "MULTI_SCOPE_FIXTURE_READY_VALIDATED");
  assert.equal(result.synthetic, true);
  assert.equal(result.exactScopeHealth, true);
  assert.equal(result.triggerCount, 20);
  assert.equal(result.archiveMarkerPresent, false);
  results.push(result);
}

assert.equal(settings.identities?.length, 4);
assert.equal(characters.length, 3);
assert.equal(relations.size, 3);
assert.equal(new Set(results.map((result) => result.identityFingerprint)).size, 3);
assert.equal(new Set(results.map((result) => result.characterFingerprint)).size, 3);
assert.equal(new Set(results.map((result) => result.relationFingerprint)).size, 3);
assert.equal(new Set(results.map((result) => result.conversationFingerprint)).size, 3);
assert.equal(new Set(characters.map((character) => character.id)).size, 3);
assert.equal(new Set([...relations.values()].map((relation) => relation.id)).size, 3);
assert.equal(new Set([...relations.values()].map((relation) => relation.conversationId)).size, 3);
assert.deepEqual(settings.identities?.find((identity) => identity.id === legacyIdentity.id), legacyIdentity);

const beforeRepeat = {
  identities: structuredClone(settings.identities),
  characters: structuredClone(characters),
  relations: structuredClone([...relations.entries()]),
};
for (const fixtureId of MULTI_SCOPE_FIXTURE_IDS) {
  const repeated = await api.bootstrap({ fixtureId });
  assert.deepEqual(repeated, results.find((result) => result.fixtureId === fixtureId));
  const inspected = await api.inspect({ fixtureId });
  assert.deepEqual(inspected, repeated);
}
assert.deepEqual(settings.identities, beforeRepeat.identities);
assert.deepEqual(characters, beforeRepeat.characters);
assert.deepEqual([...relations.entries()], beforeRepeat.relations);

const scopeA = await api.inspect({ fixtureId: "stage4d3-portable-a" });
const scopeB = await api.inspect({ fixtureId: "stage4d3-portable-b" });
assert.equal(scopeA.eligibleMessageCount, 2);
assert.equal(scopeB.eligibleMessageCount, 1);
assert.notEqual(scopeA.eligibleMessageCount, scopeB.eligibleMessageCount);
assert.equal(scopeA.distanceToTrigger, 18);
assert.equal(scopeB.distanceToTrigger, 19);

settings = {
  ...settings,
  identities: [...(settings.identities || []), {
    ...legacyIdentity,
    id: "duplicate-a",
    syntheticFixtureId: "stage4d3-portable-a",
  }],
};
const duplicateBlocked = await api.inspect({ fixtureId: "stage4d3-portable-a" });
assert.equal(duplicateBlocked.status, "MULTI_SCOPE_FIXTURE_IDENTITY_BLOCKED");

console.log("PASS multi-scope fixture bootstrap: isolated namespaces, exact fingerprints, idempotence, and scoped reads");
