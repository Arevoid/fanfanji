import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import {
  applyConfirmedOfflineRelationshipTransition,
  hasConfirmedOfflinePartnerTransition,
} from "../src/domain/relationship/offlineRelationshipTransition";

const relationship: CharacterRelationship = {
  id: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  conversationId: "direct:relation-a",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
};

const claim = (statement: string, overrides: Partial<KnowledgeClaim> = {}): KnowledgeClaim => ({
  id: `claim:${statement}`,
  relationId: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  conversationId: "direct:relation-a",
  kind: "fact",
  subject: "relationship",
  statement,
  truthStatus: "confirmed",
  temporalStatus: "present",
  source: {
    kind: "offline_story",
    authorship: "unknown",
    storyId: "story-a",
    producer: "test",
    evidenceKey: "test-evidence",
  },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 2,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
  ...overrides,
});

const confirmed = claim("用户接受了范千的表白，双方正式确立恋爱关系。 ");
assert.equal(hasConfirmedOfflinePartnerTransition([confirmed]), true);
const promoted = applyConfirmedOfflineRelationshipTransition({
  relationships: [relationship],
  relationId: relationship.id,
  claims: [confirmed],
  now: 10,
});
assert.equal(promoted[0].relationship, "partner", "explicitly confirmed offline romance promotes only this relation");
assert.equal(promoted[0].updatedAt, 10);

const nicknameOnly = claim("用户称呼范千为老公。", { subject: "user" });
assert.equal(hasConfirmedOfflinePartnerTransition([nicknameOnly]), false, "a nickname alone cannot mutate durable relationship state");
const hypothetical = claim("如果用户同意，双方可能确立恋爱关系。 ");
assert.equal(hasConfirmedOfflinePartnerTransition([hypothetical]), false, "hypothetical romance cannot mutate durable relationship state");
const otherRelation = applyConfirmedOfflineRelationshipTransition({
  relationships: [relationship, { ...relationship, id: "relation-b", conversationId: "direct:relation-b" }],
  relationId: "relation-b",
  claims: [confirmed],
  now: 10,
});
assert.equal(otherRelation[0].relationship, "friend", "another relation remains isolated");
assert.equal(otherRelation[1].relationship, "friend", "a claim from relation A cannot promote relation B");

console.log("offline relationship transition tests passed");
