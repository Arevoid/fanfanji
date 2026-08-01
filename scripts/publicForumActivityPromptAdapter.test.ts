import assert from "node:assert/strict";
import { buildPublicForumCognitiveContext } from "../src/domain/publicCognitive/publicContextBuilder";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import {
  buildPublicForumActivityPromptContext,
  formatPublicForumActivityPromptContext,
} from "../src/features/characterCognitive/promptAdapters/publicForumActivityPromptAdapter";
import { planForumActivity } from "../src/features/forum/services/forumActivityService";
import { generateThreadActivity } from "../src/features/forum/services/forumGenerationService";
import type { Character, ForumThread, UserSettings } from "../src/types";

const character: Character = {
  id: "character-internal-id",
  name: "Rin",
  avatar: "avatar.png",
  personality: "quiet and observant",
  backstory: "A public test persona.",
};
const relationship: CharacterRelationship = {
  id: "relation-private",
  characterId: character.id,
  userIdentityId: "identity-private",
  conversationId: "direct:relation-private",
  relationship: "friend",
  compressedMemory: "Private relationship summary",
  createdAt: 1,
  updatedAt: 1,
};
const settings = { apiKey: "test-key", selectedModel: "test-model" } as UserSettings;
const userThread: ForumThread = {
  id: "public-thread",
  ownerIdentityId: relationship.userIdentityId,
  publicAuthor: { displayName: "Public poster", kind: "user", isAnonymous: false },
  title: "Gardening question",
  body: "Public thread content about gardening tools.",
  source: "user",
  occurredAt: 1,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  replyCount: 0,
  createdAt: 1,
  updatedAt: 1,
};
const relationshipThread: ForumThread = {
  ...userThread,
  id: "relationship-public-thread",
  publicAuthor: { displayName: "Rin", kind: "ai-character", isAnonymous: false },
  source: "ai-character",
  privateAuthorRelationId: relationship.id,
  privateAuthorCharacterId: character.id,
};
const event = (id: string, summary: string): CharacterEvent => ({
  id,
  relationId: relationship.id,
  characterId: character.id,
  userIdentityId: relationship.userIdentityId,
  kind: "forum_public_content_published",
  summary,
  source: "forum",
  occurredAt: 10,
  recordedAt: 11,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
});
const publicEvents = [
  { event: event("public", "Public event"), visibility: "public" as const },
  { event: event("private", "Private event"), visibility: "private" as const },
];
const publicWorldSettings = [
  { title: "Public setting", content: "Public knowledge", visibility: "public" as const },
  { title: "Private setting", content: "Private knowledge", visibility: "private" as const },
];

const directContext = buildPublicForumCognitiveContext({
  character,
  events: publicEvents,
  worldSettings: publicWorldSettings,
  currentTime: { now: 12, date: "2026-08-01", time: "20:00" },
});
const directPrompt = formatPublicForumActivityPromptContext(
  buildPublicForumActivityPromptContext(directContext),
);
assert.match(directPrompt, /PUBLIC FORUM ACTIVITY COGNITIVE CONTEXT/);
assert.match(directPrompt, /Public event|Public setting: Public knowledge/);
assert.doesNotMatch(directPrompt, /Private event|Private setting|Private knowledge/);
assert.equal(directPrompt.includes(relationship.id), false);
assert.equal(directPrompt.includes(relationship.userIdentityId), false);
assert.equal(directPrompt.includes(relationship.conversationId), false);
assert.equal(formatPublicForumActivityPromptContext(undefined), "");

const relationshipBefore = JSON.stringify(relationship);
const activityRequests: Array<{ message: string; systemInstruction: string }> = [];
const pending = await planForumActivity({
  trigger: "automatic",
  ownerIdentityId: relationship.userIdentityId,
  thread: userThread,
  replies: [],
  actorStates: [],
  relationships: [relationship],
  characters: [character],
  messages: [],
  memories: [],
  worldBookEntries: [],
  settings,
  now: 12,
  random: () => 0.9,
  publicEventCandidates: publicEvents,
  publicWorldSettings,
  aiCall: async (request) => {
    activityRequests.push(request);
    return {
      text: JSON.stringify({
        events: [{
          localId: "e1",
          actorSlot: "relation-1",
          kind: "reply",
          body: "Gardening tools should be cleaned after use.",
          replyTo: { type: "thread" },
          delaySeconds: 30,
        }],
      }),
    };
  },
});
assert.equal(pending.length, 1);
assert.match(activityRequests[0].message, /PUBLIC FORUM ACTIVITY COGNITIVE CONTEXT/);
assert.match(activityRequests[0].message, /Public event|Public setting: Public knowledge/);
assert.doesNotMatch(activityRequests[0].message, /Private event|Private setting|Private knowledge|Private relationship summary/);
assert.equal(activityRequests[0].message.includes(relationship.id), false);
assert.equal(activityRequests[0].message.includes(relationship.userIdentityId), false);
assert.equal(activityRequests[0].message.includes(relationship.conversationId), false);
assert.equal(JSON.stringify(relationship), relationshipBefore, "public activity does not mutate relationships");

const manualRequests: Array<{ message: string; systemInstruction: string }> = [];
const manualResult = await generateThreadActivity({
  trigger: "manual-thread-refresh",
  ownerIdentityId: relationship.userIdentityId,
  thread: relationshipThread,
  existingReplies: [],
  relationships: [relationship],
  characters: [character],
  messages: [],
  memories: [],
  worldBookEntries: [],
  settings,
  now: 13,
  random: () => 0,
  publicEventCandidates: publicEvents,
  publicWorldSettings,
  aiCall: async (request) => {
    manualRequests.push(request);
    return { text: JSON.stringify({ body: "I found another useful gardening tip.", replyToFloor: null }) };
  },
});
assert.equal(manualResult.outcome, "author-update");
assert.match(manualRequests[0].message, /PUBLIC FORUM ACTIVITY COGNITIVE CONTEXT/);
assert.doesNotMatch(manualRequests[0].message, /PUBLIC FORUM REPLY COGNITIVE CONTEXT|Private event|Private relationship summary/);
assert.equal(manualRequests[0].message.includes(relationship.id), false);

const virtualRequests: Array<{ message: string; systemInstruction: string }> = [];
await planForumActivity({
  trigger: "automatic",
  ownerIdentityId: relationship.userIdentityId,
  thread: userThread,
  replies: [],
  actorStates: [],
  relationships: [],
  characters: [character],
  messages: [],
  memories: [],
  worldBookEntries: [],
  settings,
  now: 14,
  random: () => 0.9,
  aiCall: async (request) => {
    virtualRequests.push(request);
    return {
      text: JSON.stringify({
        events: [{
          localId: "e1",
          actorSlot: "virtual-1",
          kind: "reply",
          body: "Gardening tools need a dry place after use.",
          replyTo: { type: "thread" },
          delaySeconds: 30,
        }],
      }),
    };
  },
});
assert.doesNotMatch(virtualRequests[0].message, /PUBLIC FORUM ACTIVITY COGNITIVE CONTEXT/);

console.log("PASS public Forum activity prompt adapter public filtering, activity integration, legacy compatibility, and no private side effects");
