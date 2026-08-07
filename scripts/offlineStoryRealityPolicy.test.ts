import assert from "node:assert/strict";
import {
  evaluateOfflineStoryReality,
  type OfflineStoryEvent,
} from "../src/domain/offlineStory/offlineStoryRealityPolicy";

const scope = {
  relationId: "relation-offline-a",
  characterId: "character-offline-a",
  userIdentityId: "identity-offline-a",
};
const event = (overrides: Partial<OfflineStoryEvent> = {}): OfflineStoryEvent => ({
  storyId: "story-reality-a",
  ...scope,
  mode: "continue",
  status: "confirmed",
  source: "offline_story:story-reality-a:completed",
  userConfirmed: true,
  explicitlyOccurred: true,
  ...overrides,
});

assert.equal(evaluateOfflineStoryReality(event(), scope).allowed, true, "confirmed real event is allowed");
assert.equal(evaluateOfflineStoryReality(event({ status: "hypothetical" }), scope).allowed, false);
assert.equal(evaluateOfflineStoryReality(event({ isWhatIf: true }), scope).allowed, false);
assert.equal(evaluateOfflineStoryReality(event({ mode: "director" }), scope).allowed, false);
assert.equal(evaluateOfflineStoryReality(event({ mode: "if" }), scope).allowed, false);
assert.equal(evaluateOfflineStoryReality(event({ isFictionalContinuation: true }), scope).allowed, false);
assert.equal(evaluateOfflineStoryReality(event({ isAiGenerated: true }), scope).allowed, false);
assert.equal(evaluateOfflineStoryReality(event({ source: "what-if:story" }), scope).allowed, false);
assert.equal(evaluateOfflineStoryReality(event({ userConfirmed: false }), scope).allowed, false);
assert.equal(evaluateOfflineStoryReality(event({ explicitlyOccurred: false, status: "active" }), scope).allowed, false);
assert.equal(
  evaluateOfflineStoryReality(event({ relationId: "relation-offline-b", userIdentityId: "identity-offline-b" }), scope).reason,
  "relation_scope_mismatch",
);
assert.equal(evaluateOfflineStoryReality(event({ source: "ai-generated:story" }), scope).allowed, false);

console.log("offlineStoryRealityPolicy.test.ts passed");
