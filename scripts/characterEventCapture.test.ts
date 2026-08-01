import assert from "node:assert/strict";
import {
  appendCharacterEvents,
  removeCharacterEventsByRelations,
} from "../src/domain/characterLife/eventPolicy";
import {
  buildOfflineStoryCompletedEvent,
  buildRelationshipCreatedEvent,
} from "../src/features/characterLife/services/characterEventCaptureService";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import type { OfflineStory } from "../src/types";

const relationship = createRelationship({
  id: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  now: 100,
});

const relationshipEvent = buildRelationshipCreatedEvent(relationship, 101);
assert.equal(relationshipEvent.kind, "relationship_created");
assert.equal(relationshipEvent.source, "relationship");
assert.equal(relationshipEvent.relationId, relationship.id);
assert.equal(relationshipEvent.userIdentityId, relationship.userIdentityId);

const story: OfflineStory = {
  id: "story-a",
  characterId: relationship.characterId,
  relationId: relationship.id,
  title: "A story",
  createdAt: 200,
  updatedAt: 300,
  archivedAt: 400,
  mode: "continue",
  messages: [],
};
const storyEvent = buildOfflineStoryCompletedEvent(story, relationship.userIdentityId, 401);
assert.ok(storyEvent);
assert.equal(storyEvent?.kind, "offline_story_completed");
assert.equal(storyEvent?.source, "offline_story");
assert.equal(storyEvent?.occurredAt, story.archivedAt);
assert.equal(buildOfflineStoryCompletedEvent({ ...story, relationId: undefined }, relationship.userIdentityId), undefined);

const once = appendCharacterEvents([], [relationshipEvent, storyEvent!]);
const twice = appendCharacterEvents(once, [relationshipEvent, storyEvent!]);
assert.equal(twice.length, once.length, "repeated capture remains idempotent");
assert.equal(removeCharacterEventsByRelations(twice, [relationship.id]).length, 0);

console.log("PASS CharacterEvent deterministic relationship/offline capture, idempotency, and cleanup");
