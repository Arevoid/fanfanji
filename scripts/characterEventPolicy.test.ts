import assert from "node:assert/strict";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import {
  evaluateCharacterEventTrust,
  isCharacterEventTrusted,
} from "../src/domain/characterLife/characterEventPolicy";
import type { CharacterLifeScope } from "../src/domain/characterLife/characterLifeTypes";

const scope: CharacterLifeScope = {
  relationId: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
};

const event = (overrides: Partial<CharacterEvent> = {}): CharacterEvent => ({
  id: "event-a",
  ...scope,
  kind: "offline_story_completed",
  summary: "用户确认了线下剧情",
  source: "offline_story:story-a:completed",
  occurredAt: 100,
  recordedAt: 101,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
  ...overrides,
});

assert.equal(isCharacterEventTrusted(event(), scope), true, "confirmed active event is allowed");
assert.deepEqual(evaluateCharacterEventTrust(event(), scope), {
  allowed: true,
  reason: "confirmed_active_explicit_event",
});

assert.equal(isCharacterEventTrusted(event({ status: "candidate" }), scope), false);
assert.equal(evaluateCharacterEventTrust(event({ confidence: 0.8 }), scope).reason, "event_not_confirmed");

assert.equal(
  evaluateCharacterEventTrust(event({ source: "ai-generated:offline-story" }), scope).reason,
  "ai_or_inferred_source",
);
assert.equal(isCharacterEventTrusted(event({ status: "inferred" }), scope), false);
assert.equal(
  evaluateCharacterEventTrust(event({ status: "disputed" }), scope).reason,
  "event_status_disputed",
);

const otherScope: CharacterLifeScope = {
  relationId: "relation-b",
  characterId: "character-a",
  userIdentityId: "identity-b",
};
assert.equal(
  evaluateCharacterEventTrust(event(), otherScope).reason,
  "relation_scope_mismatch",
  "an event cannot cross into another relation scope",
);

assert.equal(
  evaluateCharacterEventTrust(event({ source: "" }), scope).reason,
  "missing_source",
);
assert.equal(
  evaluateCharacterEventTrust(event({ relationId: "" }), scope).reason,
  "missing_relation_scope",
);

console.log("characterEventPolicy.test.ts passed");
