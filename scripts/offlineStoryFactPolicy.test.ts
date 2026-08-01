import assert from "node:assert/strict";
import {
  canCreateCharacterEventFromOfflineStory,
  canSyncOfflineStoryToMemory,
  classifyOfflineStoryFactLevel,
} from "../src/domain/offlineStory/offlineStoryFactPolicy";
import type { Message, OfflineStory } from "../src/types";

const message = (sender: Message["sender"], content: string): Message => ({
  id: `${sender}-${content}`,
  characterId: "character-1",
  sender,
  content,
  timestamp: 1,
  isOffline: true,
});

const story = (overrides: Partial<OfflineStory> = {}): OfflineStory => ({
  id: "story-1",
  characterId: "character-1",
  relationId: "relation-1",
  conversationId: "conversation-1",
  title: "Confirmed continuation",
  createdAt: 1,
  updatedAt: 2,
  mode: "continue",
  messages: [],
  ...overrides,
});

const confirmedContinuation = {
  story: story(),
  userConfirmed: true,
  sourceMessages: [message("user", "We met after work."), message("character", "I remember.")],
};

assert.equal(canSyncOfflineStoryToMemory(confirmedContinuation), true, "confirmed direct continuation can sync memory");
assert.equal(classifyOfflineStoryFactLevel(confirmedContinuation), "event_eligible", "confirmed single-character continuation is eligible for a future event policy");
assert.equal(canSyncOfflineStoryToMemory({ ...confirmedContinuation, story: story({ mode: "if" }) }), false, "IF story is rejected");
assert.equal(canSyncOfflineStoryToMemory({ ...confirmedContinuation, story: story({ mode: "director" }) }), false, "director story is rejected");
assert.equal(canSyncOfflineStoryToMemory({ ...confirmedContinuation, userConfirmed: false }), false, "unconfirmed story is rejected");
assert.equal(canSyncOfflineStoryToMemory({ ...confirmedContinuation, sourceMessages: [message("character", "AI-only plot")] }), false, "AI-only plot is rejected");

const multiCharacter = {
  ...confirmedContinuation,
  story: story({ characterIds: ["character-1", "character-2"] }),
};
assert.equal(canSyncOfflineStoryToMemory(multiCharacter), false, "multi-character story without participant relation scope is rejected");
assert.equal(canCreateCharacterEventFromOfflineStory(multiCharacter), false, "multi-character story cannot create a relationship event");
assert.equal(classifyOfflineStoryFactLevel(multiCharacter), "story_only", "unsafe multi-character story remains in the story workspace");

console.log("offline story fact policy tests passed");
