import assert from "node:assert/strict";
import { buildPublicForumCognitiveContext } from "../src/domain/publicCognitive/publicContextBuilder";
import { canExposeToPublicContext } from "../src/domain/publicCognitive/publicVisibilityPolicy";
import type { Character } from "../src/types";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";

const character: Character = {
  id: "character-internal-id",
  name: "Public Rin",
  avatar: "avatar.png",
  personality: "calm and observant",
  backstory: "A public test profile.",
};
const event = (id: string, relationId: string, userIdentityId: string, summary: string): CharacterEvent => ({
  id,
  relationId,
  characterId: character.id,
  userIdentityId,
  kind: "forum_public_content_published",
  summary,
  source: "forum",
  occurredAt: 10,
  recordedAt: 11,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
});

assert.equal(canExposeToPublicContext(undefined), false, "unknown sources are denied");
assert.equal(canExposeToPublicContext({}), false, "missing visibility is denied");
assert.equal(canExposeToPublicContext({ visibility: "private" }), false);
assert.equal(canExposeToPublicContext({ visibility: "relationship" }), false);
assert.equal(canExposeToPublicContext({ visibility: "public" }), true);

const context = buildPublicForumCognitiveContext({
  character,
  events: [
    { event: event("private", "relation-private", "identity-private", "Private event"), visibility: "private" },
    { event: event("relationship", "relation-relationship", "identity-relationship", "Relationship-only event"), visibility: "relationship" },
    { event: event("public", "relation-public", "identity-public", "Public event"), visibility: "public" },
    { event: event("unknown", "relation-unknown", "identity-unknown", "Unknown event") },
  ],
  worldSettings: [
    { title: "Private world", content: "Private setting", visibility: "private" },
    { title: "Unknown world", content: "Unknown setting" },
    { title: "Public world", content: "Public setting", visibility: "public" },
  ],
  currentTime: { now: 12, date: "2026-08-01", time: "20:00" },
});

assert.deepEqual(context.publicEvents.map((item) => item.summary), ["Public event"]);
assert.deepEqual(context.publicWorldSettings, [{ title: "Public world", content: "Public setting" }]);
assert.equal(context.currentTime.date, "2026-08-01");
assert.equal(context.currentTime.time, "20:00");
const serialized = JSON.stringify(context);
for (const value of [
  character.id,
  "relation-private",
  "identity-private",
  "relation-relationship",
  "identity-relationship",
  "Private event",
  "Relationship-only event",
  "Unknown event",
  "Private setting",
  "Unknown setting",
]) assert.equal(serialized.includes(value), false, `public context must not expose ${value}`);

console.log("PASS public Forum cognitive context deny-by-default visibility, redaction, and time projection");
