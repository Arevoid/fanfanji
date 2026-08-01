import assert from "node:assert/strict";
import {
  evaluateOfflineStoryCompletedEvent,
  getOfflineStoryCompletionSourceKey,
} from "../src/domain/offlineStory/offlineStoryEventPolicy";
import type { Message, OfflineStory } from "../src/types";

const sourceMessage = (sender: Message["sender"], content: string): Message => ({
  id: `${sender}-${content}`,
  characterId: "character-1",
  sender,
  content,
  timestamp: 1,
  isOffline: true,
});

const story = (id = "story-1", overrides: Partial<OfflineStory> = {}): OfflineStory => ({
  id,
  characterId: "character-1",
  relationId: "relation-1",
  title: "A mutable writing title must not become an event fact",
  createdAt: 1,
  updatedAt: 2,
  mode: "continue",
  messages: [],
  ...overrides,
});

const confirmed = (currentStory = story()) => ({
  story: currentStory,
  isCompleted: true,
  userConfirmed: true,
  sourceMessages: [sourceMessage("user", "Confirmed real continuation."), sourceMessage("character", "Acknowledged.")],
});

const eligible = evaluateOfflineStoryCompletedEvent(confirmed());
assert.equal(eligible.allowed, true, "confirmed completed continuation is event-eligible");
assert.equal(eligible.kind, "offline_story_completed");
assert.equal(eligible.storyId, "story-1");
assert.equal(eligible.relationId, "relation-1");
assert.equal(eligible.confidence, 1);
assert.equal(eligible.sourceKey, getOfflineStoryCompletionSourceKey("story-1"));
assert.equal("summary" in eligible, false, "policy never converts story title into a fact summary");

assert.equal(evaluateOfflineStoryCompletedEvent(confirmed(story("if-story", { mode: "if" }))).allowed, false, "IF story is rejected");
assert.equal(evaluateOfflineStoryCompletedEvent(confirmed(story("director-story", { mode: "director" }))).allowed, false, "director story is rejected");
assert.equal(evaluateOfflineStoryCompletedEvent({ ...confirmed(), isCompleted: false }).allowed, false, "incomplete story is rejected");
assert.equal(evaluateOfflineStoryCompletedEvent(confirmed(story("multi-story", { characterIds: ["character-1", "character-2"] }))).allowed, false, "multi-character story without relation scope is rejected");

const duplicate = evaluateOfflineStoryCompletedEvent({
  ...confirmed(),
  recordedSourceKeys: [getOfflineStoryCompletionSourceKey("story-1")],
});
assert.equal(duplicate.allowed, false, "same story completion is idempotent");
assert.equal(duplicate.duplicate, true);

const anotherStory = evaluateOfflineStoryCompletedEvent({
  ...confirmed(story("story-2")),
  recordedSourceKeys: [getOfflineStoryCompletionSourceKey("story-1")],
});
assert.equal(anotherStory.allowed, true, "different stories do not share a completion dedupe key");
assert.equal(anotherStory.duplicate, false);

console.log("offline story event policy tests passed");
