import assert from "node:assert/strict";
import { buildPublicForumCognitiveContext } from "../src/domain/publicCognitive/publicContextBuilder";
import {
  buildPublicForumReplyPromptContext,
  formatPublicForumReplyPromptContext,
} from "../src/features/characterCognitive/promptAdapters/publicForumReplyPromptAdapter";
import { generateInitialRepliesForUserThread } from "../src/features/forum/services/forumGenerationService";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import type { Character, ForumThread, UserSettings } from "../src/types";

const character: Character = {
  id: "character-internal-id",
  name: "Rin",
  avatar: "avatar.png",
  personality: "quiet and observant",
  backstory: "A public test persona.",
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
const relation: CharacterRelationship = {
  id: "relation-private",
  characterId: character.id,
  userIdentityId: "identity-private",
  conversationId: "direct:relation-private",
  relationship: "friend",
  compressedMemory: "Private relationship summary",
  createdAt: 1,
  updatedAt: 1,
};
const thread: ForumThread = {
  id: "public-thread",
  ownerIdentityId: relation.userIdentityId,
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
const settings = { apiKey: "test-key", selectedModel: "test-model" } as UserSettings;

const context = buildPublicForumCognitiveContext({
  character,
  events: [
    { event: event("public", "relation-public", "identity-public", "Public event"), visibility: "public" },
    { event: event("private", relation.id, relation.userIdentityId, "Private event"), visibility: "private" },
  ],
  worldSettings: [
    { title: "Public setting", content: "Public knowledge", visibility: "public" },
    { title: "Private setting", content: "Private knowledge", visibility: "private" },
  ],
  currentTime: { now: 12, date: "2026-08-01", time: "20:00" },
});
const prompt = formatPublicForumReplyPromptContext(buildPublicForumReplyPromptContext(context));
assert.match(prompt, /PUBLIC FORUM REPLY COGNITIVE CONTEXT/);
assert.match(prompt, /Public event|Public setting: Public knowledge/);
assert.doesNotMatch(prompt, /Private event|Private setting|Private knowledge/);
assert.equal(prompt.includes(relation.id), false);
assert.equal(prompt.includes(relation.userIdentityId), false);
assert.equal(prompt.includes(relation.conversationId), false);
assert.equal(formatPublicForumReplyPromptContext(undefined), "", "missing context keeps the legacy reply path");

const relationshipBefore = JSON.stringify(relation);
const capturedRequests: Array<{ message: string; systemInstruction: string }> = [];
const replies = await generateInitialRepliesForUserThread({
  thread,
  existingReplies: [],
  relationships: [relation],
  characters: [character],
  messages: [],
  memories: [],
  worldBookEntries: [],
  settings,
  now: 12,
  maxReplies: 1,
  random: () => 0,
  publicEventCandidates: [
    { event: event("integrated-public", "relation-public", "identity-public", "Integrated public event"), visibility: "public" },
    { event: event("integrated-private", relation.id, relation.userIdentityId, "Integrated private event"), visibility: "private" },
  ],
  publicWorldSettings: [{ title: "Integrated world", content: "Public world fact", visibility: "public" }],
  aiCall: async (request) => {
    capturedRequests.push(request);
    return { text: JSON.stringify({ body: "Gardening tools need a dry place after use.", anonymous: true, replyToFloor: null }) };
  },
});
assert.equal(replies.length, 1);
assert.equal(capturedRequests.length, 1);
const integratedPrompt = capturedRequests[0].message;
assert.match(integratedPrompt, /Public thread content about gardening tools/);
assert.match(integratedPrompt, /PUBLIC FORUM REPLY COGNITIVE CONTEXT|Integrated public event|Integrated world: Public world fact/);
assert.doesNotMatch(integratedPrompt, /Integrated private event|Private relationship summary/);
assert.equal(integratedPrompt.includes(relation.id), false);
assert.equal(integratedPrompt.includes(relation.userIdentityId), false);
assert.equal(integratedPrompt.includes(relation.conversationId), false);
assert.equal(JSON.stringify(relation), relationshipBefore, "public replies do not create or mutate a relationship");

const virtualRequests: Array<{ message: string; systemInstruction: string }> = [];
await generateInitialRepliesForUserThread({
  thread,
  existingReplies: [],
  relationships: [],
  characters: [character],
  messages: [],
  memories: [],
  worldBookEntries: [],
  settings,
  now: 13,
  maxReplies: 1,
  random: () => 0.9,
  aiCall: async (request) => {
    virtualRequests.push(request);
    return { text: JSON.stringify({ body: "Gardening tools should be cleaned first.", replyToFloor: null }) };
  },
});
assert.doesNotMatch(virtualRequests[0].message, /PUBLIC FORUM REPLY COGNITIVE CONTEXT/, "virtual users retain the legacy reply prompt");

console.log("PASS public Forum reply prompt adapter public filtering, public thread context, isolation, and no private side effects");
