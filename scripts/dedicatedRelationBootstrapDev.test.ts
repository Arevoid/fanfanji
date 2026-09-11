import assert from "node:assert/strict";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import {
  createDedicatedRelationBootstrapApi,
  type DedicatedRelationInspectorResult,
} from "../src/features/archives/dedicatedRelationBootstrapDev";
import { LEGACY_DEDICATED_SYNTHETIC_IDENTITY_NAME, SYNTHETIC_IDENTITY_BIO } from "../src/features/archives/characterOwnershipBootstrapDev";
import type { Character, Message, UserIdentity, UserSettings } from "../src/types";

const identity: UserIdentity = {
  id: "synthetic-identity-canonical",
  name: LEGACY_DEDICATED_SYNTHETIC_IDENTITY_NAME,
  avatar: "synthetic-avatar",
  signature: "",
  bio: SYNTHETIC_IDENTITY_BIO,
  kind: "primary",
};

const character = {
  id: "synthetic-character-canonical",
  ownerIdentityId: identity.id,
  name: "Synthetic Character",
  avatar: "synthetic-avatar",
  personality: "synthetic",
  backstory: "",
  summaryTriggerRound: 10,
  isGroupChat: false,
  isContactInstance: false,
} as Character;

const settings = { identities: [identity] } as UserSettings;
let relationships = [] as ReturnType<typeof createRelationship>[];
let messages: Message[] = [];
let relationshipEvents = 0;

const api = createDedicatedRelationBootstrapApi({
  getSettings: () => settings,
  readCharacters: () => [character],
  getRelationships: () => relationships,
  persistRelationships: async (next) => {
    relationships = [...next];
    return true;
  },
  readRelationships: () => relationships,
  readMessages: async (scope) => messages.filter((message) =>
    message.characterId === scope.characterId
    && message.relationId === scope.relationId
    && message.conversationId === scope.conversationId),
  captureRelationshipCreatedEvent: () => { relationshipEvents += 1; },
  now: () => 100,
});

const first = await api.bootstrap();
assert.equal(first.status, "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED");
assert.equal(relationships.length, 1);
assert.equal(relationshipEvents, 1);
assert.equal(relationships[0].relationship, "friend");
assert.equal(relationships[0].conversationId, `direct:${relationships[0].id}`);
assert.ok(first.identityFingerprint);
assert.ok(first.characterFingerprint);
assert.ok(first.relationFingerprint);
assert.ok(first.conversationFingerprint);
assert.ok(!first.relationFingerprint.includes(relationships[0].id));
assert.ok(!first.conversationFingerprint.includes(relationships[0].conversationId));

const expected = (result: DedicatedRelationInspectorResult) => {
  assert.equal(result.exactScopeHealth, true);
  assert.equal(result.eligibleMessageCount, 0);
  assert.equal(result.triggerCount, 20);
  assert.equal(result.distanceToTrigger, 20);
  assert.equal(result.archiveMarkerPresent, false);
  assert.equal(result.archiveMarkerFoundInLoadedScope, false);
  assert.equal(result.exactPendingRange, true);
  assert.equal(result.inFlight, false);
  assert.equal(result.cooldownActive, false);
  assert.equal(result.isGroup, false);
  assert.equal(result.isOffline, false);
  assert.equal(result.nextTurnTriggers, false);
  assert.equal(result.lifecycleState, "ready");
};
expected(first);

const beforeRelationships = structuredClone(relationships);
const beforeMessages = structuredClone(messages);
const inspected = await api.inspectDedicatedEvidenceFixture();
assert.equal(inspected.status, "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED");
expected(inspected);
assert.deepEqual(relationships, beforeRelationships);
assert.deepEqual(messages, beforeMessages);

const duplicate = await api.bootstrap();
assert.equal(duplicate.status, "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED");
assert.equal(relationships.length, 1);
assert.equal(relationshipEvents, 1);

const grouped = createDedicatedRelationBootstrapApi({
  getSettings: () => settings,
  readCharacters: () => [{ ...character, isGroupChat: true }],
  getRelationships: () => [],
  persistRelationships: async () => { throw new Error("group fixture must not persist"); },
  readRelationships: () => [],
  readMessages: async () => [],
  captureRelationshipCreatedEvent: () => { throw new Error("group fixture must not capture"); },
});
assert.equal((await grouped.bootstrap()).status, "DEDICATED_RELATION_FIXTURE_PRECONDITION_BLOCKED");

const wrongOwner = createDedicatedRelationBootstrapApi({
  getSettings: () => settings,
  readCharacters: () => [{ ...character, ownerIdentityId: "another-owner" }],
  getRelationships: () => [],
  persistRelationships: async () => { throw new Error("wrong owner must not persist"); },
  readRelationships: () => [],
  readMessages: async () => [],
  captureRelationshipCreatedEvent: () => { throw new Error("wrong owner must not capture"); },
});
assert.equal((await wrongOwner.inspectDedicatedEvidenceFixture()).status, "DEDICATED_FIXTURE_INSPECTOR_BLOCKED");

const existingRelation = relationships[0];
const runtimeGlobal = globalThis as unknown as { window?: unknown };
const previousWindow = runtimeGlobal.window;
const offlineStorage = new Map<string, string>([[`offline_mode_active_${existingRelation.id}`, "true"]]);
runtimeGlobal.window = {
  localStorage: {
    getItem: (key: string) => offlineStorage.get(key) ?? null,
  } as Storage,
};
const offline = await api.inspectDedicatedEvidenceFixture();
assert.equal(offline.status, "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED");
assert.equal(offline.isOffline, true);
assert.equal(offline.nextTurnTriggers, false);
runtimeGlobal.window = previousWindow;

console.log("PASS dedicated relation bootstrap, exact direct scope inspector, duplicate guard, and mutation-free checks");

const portableIdentity: UserIdentity = {
  id: "portable-identity-canonical",
  name: "Stage4D3Portable User",
  avatar: "portable-avatar",
  signature: "",
  bio: SYNTHETIC_IDENTITY_BIO,
  kind: "primary",
  syntheticFixtureId: "stage4d3-portable",
};
const portableCharacter: Character = {
  ...character,
  id: "portable-character-canonical",
  ownerIdentityId: portableIdentity.id,
  name: "Stage4D3Portable Character",
  syntheticFixtureId: "stage4d3-portable",
};
let coexistRelationships = [...relationships];
const legacyRelationshipBefore = structuredClone(coexistRelationships[0]);
const coexistApi = createDedicatedRelationBootstrapApi({
  getSettings: () => ({ identities: [identity, portableIdentity] } as UserSettings),
  readCharacters: () => [character, portableCharacter],
  getRelationships: () => coexistRelationships,
  persistRelationships: async (next) => { coexistRelationships = [...next]; return true; },
  readRelationships: () => coexistRelationships,
  readMessages: async (scope) => messages.filter((message) =>
    message.characterId === scope.characterId
    && message.relationId === scope.relationId
    && message.conversationId === scope.conversationId),
  captureRelationshipCreatedEvent: () => undefined,
  now: () => 200,
});
const portableRelationResult = await coexistApi.bootstrap({
  fixtureId: "stage4d3-portable",
  identityId: portableIdentity.id,
  characterId: portableCharacter.id,
});
assert.equal(portableRelationResult.status, "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED");
assert.equal(coexistRelationships.length, 2);
assert.deepEqual(coexistRelationships.find((candidate) => candidate.id === legacyRelationshipBefore.id), legacyRelationshipBefore);
const portableRelation = coexistRelationships.find((candidate) => candidate.syntheticFixtureId === "stage4d3-portable");
assert.ok(portableRelation);
assert.notEqual(portableRelation?.id, legacyRelationshipBefore.id);
assert.notEqual(portableRelation?.conversationId, legacyRelationshipBefore.conversationId);
const portableInspect = await coexistApi.inspectDedicatedEvidenceFixture({ fixtureId: "stage4d3-portable", identityId: portableIdentity.id, characterId: portableCharacter.id });
assert.equal(portableInspect.exactScopeHealth, true);
assert.equal((await coexistApi.inspectDedicatedEvidenceFixture()).exactScopeHealth, true);

console.log("PASS synthetic fixture relation namespaces coexist with legacy relation and conversation intact");
