import assert from "node:assert/strict";
import { isWorldBookEntryVisible, resolveWorldBookScope } from "../src/domain/worldbook/worldBookVisibility";
import { buildWorldBookSystemBlocks } from "../src/utils/worldBook";
import type { WorldBookEntry } from "../src/types";

const base = (id: string, overrides: Partial<WorldBookEntry> = {}): WorldBookEntry => ({
  id,
  title: id,
  category: "常规",
  content: `内容-${id}`,
  timestamp: 1,
  triggerType: "constant",
  ...overrides,
});

const legacyGlobal = base("legacy-global", { characterId: "global" });
const legacyCharacter = base("legacy-character", { characterId: "char-a" });
const publicGlobal = base("public-global", { visibility: "public", purpose: "world_canon" });
const publicCharacter = base("public-character", { characterId: "char-a", visibility: "public", purpose: "persona_rule" });
const privateIdentity = base("private-identity", { scope: { kind: "identity", userIdentityId: "identity-a" } });
const privateRelation = base("private-relation", { scope: { kind: "relationship", relationId: "relation-a", characterId: "char-a", userIdentityId: "identity-a" } });

assert.equal(resolveWorldBookScope(legacyGlobal).kind, "global");
assert.equal(resolveWorldBookScope(legacyCharacter).kind, "character");
assert.equal(isWorldBookEntryVisible(legacyGlobal, { scenario: "chat", characterId: "char-a", userIdentityId: "identity-a" }), true);
assert.equal(isWorldBookEntryVisible(legacyGlobal, { scenario: "public", characterId: "char-a" }), false, "legacy entries are not inferred public");
assert.equal(isWorldBookEntryVisible(publicGlobal, { scenario: "public", characterId: "char-a" }), true);
assert.equal(isWorldBookEntryVisible(publicCharacter, { scenario: "public", characterId: "char-a" }), true);
assert.equal(isWorldBookEntryVisible(publicCharacter, { scenario: "public", characterId: "char-b" }), false);
assert.equal(isWorldBookEntryVisible(privateIdentity, { scenario: "chat", characterId: "char-a", userIdentityId: "identity-a" }), true);
assert.equal(isWorldBookEntryVisible(privateIdentity, { scenario: "chat", characterId: "char-a", userIdentityId: "identity-b" }), false);
assert.equal(isWorldBookEntryVisible(privateRelation, { scenario: "chat", characterId: "char-a", userIdentityId: "identity-a", relationId: "relation-a" }), true);
assert.equal(isWorldBookEntryVisible(privateRelation, { scenario: "chat", characterId: "char-a", userIdentityId: "identity-b", relationId: "relation-b" }), false);
assert.equal(isWorldBookEntryVisible(privateRelation, { scenario: "group", characterId: "char-a", userIdentityId: "identity-a", relationId: "relation-a" }), false);

const privateBlocks = buildWorldBookSystemBlocks(
  [legacyGlobal, legacyCharacter, publicGlobal, privateRelation],
  "char-a",
  "",
  { scenario: "chat", characterId: "char-a", userIdentityId: "identity-a", relationId: "relation-a" },
);
assert.deepEqual(privateBlocks.allTriggered.map((entry) => entry.id), ["legacy-global", "legacy-character", "public-global", "private-relation"]);

const publicBlocks = buildWorldBookSystemBlocks(
  [legacyGlobal, legacyCharacter, publicGlobal, publicCharacter, privateRelation],
  "char-a",
  "",
  { scenario: "public", characterId: "char-a" },
);
assert.deepEqual(publicBlocks.allTriggered.map((entry) => entry.id), ["public-global", "public-character"]);

const groupBlocks = buildWorldBookSystemBlocks(
  [legacyGlobal, legacyCharacter, privateRelation],
  "char-a",
  "",
  { scenario: "group", characterId: "char-a", userIdentityId: "identity-a", relationId: "relation-a" },
);
assert.deepEqual(groupBlocks.allTriggered.map((entry) => entry.id), ["legacy-global", "legacy-character"]);

console.log("PASS WorldBook scope, explicit public opt-in, relation isolation, and group/public visibility boundaries");
