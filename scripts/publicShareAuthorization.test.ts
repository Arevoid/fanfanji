import assert from "node:assert/strict";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { buildMomentPublicCognitiveContext } from "../src/domain/momentCognitive/momentPublicContextBuilder";
import { canExposeToMomentPublicContext } from "../src/domain/momentCognitive/momentPublicVisibilityPolicy";
import {
  evaluatePublicShareAuthorization,
  type PublicShareAuthorization,
} from "../src/domain/publicCognitive/publicShareAuthorization";
import type { Character } from "../src/types";

const character: Character = {
  id: "character-public-share",
  name: "公开角色",
  avatar: "",
  personality: "克制",
  backstory: "公开背景",
};
const scope = {
  relationId: "relation-public-a",
  characterId: character.id,
  userIdentityId: "identity-public-a",
};
const event: CharacterEvent = {
  id: "event-public-share-a",
  ...scope,
  kind: "offline_story_completed",
  summary: "一段关系内的线下经历",
  source: "offline_story:story-a:completed",
  occurredAt: 10,
  recordedAt: 11,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
};
const authorization = (overrides: Partial<PublicShareAuthorization> = {}): PublicShareAuthorization => ({
  id: "share-auth-a",
  sourceEventId: event.id,
  ...scope,
  scope: "moment",
  status: "authorized",
  createdAt: 12,
  ...overrides,
});
const target = { ...scope, sourceEventId: event.id, scope: "moment" as const };

assert.equal(evaluatePublicShareAuthorization(undefined, target).allowed, false, "missing authorization is denied");
assert.equal(evaluatePublicShareAuthorization(authorization(), target).allowed, true, "authorized grant is accepted");
assert.equal(evaluatePublicShareAuthorization(authorization({ status: "revoked" }), target).allowed, false, "revoked grant is denied");
assert.equal(
  evaluatePublicShareAuthorization(authorization({ relationId: "relation-public-b", userIdentityId: "identity-public-b" }), target).reason,
  "relation_scope_mismatch",
  "authorization cannot cross relations",
);
assert.equal(evaluatePublicShareAuthorization(authorization({ scope: "forum" }), target).allowed, false);

assert.equal(canExposeToMomentPublicContext({ visibility: "public" }), true);
assert.equal(canExposeToMomentPublicContext({ visibility: "public", isRelationshipScoped: true }), false);
assert.equal(
  canExposeToMomentPublicContext(
    { visibility: "public", isRelationshipScoped: true, authorization: authorization() },
    target,
  ),
  true,
);

const context = buildMomentPublicCognitiveContext({
  character,
  publicEvents: [
    { event, visibility: "public", isRelationshipScoped: true },
    { event: { ...event, id: "event-authorized", summary: "已授权公开经历" }, visibility: "public", isRelationshipScoped: true, authorization: authorization({ sourceEventId: "event-authorized" }) },
    { event: { ...event, id: "event-revoked", summary: "已撤销公开经历" }, visibility: "public", isRelationshipScoped: true, authorization: authorization({ sourceEventId: "event-revoked", status: "revoked" }) },
    { event: { ...event, id: "event-foreign", summary: "其他关系经历", relationId: "relation-public-b", userIdentityId: "identity-public-b" }, visibility: "public", isRelationshipScoped: true, authorization: authorization({ sourceEventId: "event-foreign" }) },
  ],
  currentTime: { now: 20 },
});
assert.deepEqual(context.publicEvents.map((item) => item.summary), ["已授权公开经历"]);

console.log("publicShareAuthorization.test.ts passed");
