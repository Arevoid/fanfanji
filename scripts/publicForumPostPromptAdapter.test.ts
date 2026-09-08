import assert from "node:assert/strict";
import { buildPublicForumCognitiveContext } from "../src/domain/publicCognitive/publicContextBuilder";
import {
  buildPublicForumPostPromptContext,
  formatPublicForumPostPromptContext,
} from "../src/features/characterCognitive/promptAdapters/publicForumPostPromptAdapter";
import { buildForumRelationGenerationContext, generateForumThreads } from "../src/features/forum/services/forumGenerationService";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import type { Character } from "../src/types";
import type { UserSettings } from "../src/types";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";

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

const context = buildPublicForumCognitiveContext({
  character,
  events: [
    { event: event("public", "relation-public", "identity-public", "Public event"), visibility: "public" },
    { event: event("private", "relation-private", "identity-private", "Private event"), visibility: "private" },
    { event: event("relationship", "relation-relationship", "identity-relationship", "Relationship event"), visibility: "relationship" },
  ],
  worldSettings: [
    { title: "Public setting", content: "Public knowledge", visibility: "public" },
    { title: "Private setting", content: "Private knowledge", visibility: "private" },
  ],
  currentTime: { now: 12, date: "2026-08-01", time: "20:00" },
});
const prompt = formatPublicForumPostPromptContext(buildPublicForumPostPromptContext(context));

assert.match(prompt, /PUBLIC FORUM POST COGNITIVE CONTEXT/);
assert.match(prompt, /Public event/);
assert.match(prompt, /Public setting: Public knowledge/);
assert.doesNotMatch(prompt, /Private event|Relationship event|Private setting|Private knowledge/);
for (const internalValue of [
  character.id,
  "relation-public",
  "identity-public",
  "relation-private",
  "identity-private",
  "relation-relationship",
  "identity-relationship",
]) assert.equal(prompt.includes(internalValue), false, `prompt must not expose ${internalValue}`);
assert.equal(formatPublicForumPostPromptContext(undefined), "", "missing context keeps the legacy post flow");

const relation: CharacterRelationship = {
  id: "relation-forum-owner",
  characterId: character.id,
  userIdentityId: "identity-forum-owner",
  conversationId: "direct:relation-forum-owner",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
};
const settings = { apiKey: "test-key", selectedModel: "test-model" } as UserSettings;
const relationContext = buildForumRelationGenerationContext({
  ownerIdentityId: relation.userIdentityId,
  relationship: relation,
  characters: [character],
  messages: [{ id: "private-message", characterId: character.id, relationId: relation.id, conversationId: relation.conversationId, sender: "user", content: "PRIVATE chat marker: surprise birthday", timestamp: 1 }],
  memories: [{ id: "private-memory", characterId: character.id, relationId: relation.id, content: "PRIVATE memory marker: forbidden detail", timestamp: 1 }],
  worldBookEntries: [],
});
assert.ok(relationContext);
assert.doesNotMatch(relationContext.promptContext, /PRIVATE chat marker|PRIVATE memory marker|birthday|forbidden detail/);
const capturedRequests: Array<{ message: string; systemInstruction: string }> = [];
const generated = await generateForumThreads({
  ownerIdentityId: relation.userIdentityId,
  count: 1,
  trigger: "lazy",
  preferredRelationId: relation.id,
  relationships: [relation],
  characters: [character],
  messages: [],
  memories: [],
  worldBookEntries: [],
  existingThreads: [],
  settings,
  now: 12,
  random: () => 0.9,
  publicEventCandidates: [
    { event: event("integrated-public", relation.id, relation.userIdentityId, "Integrated public event"), visibility: "public" },
    { event: event("integrated-private", relation.id, relation.userIdentityId, "Integrated private event"), visibility: "private" },
  ],
  publicWorldSettings: [{ title: "Integrated world", content: "Public world fact", visibility: "public" }],
  aiCall: async (request) => {
    capturedRequests.push(request);
    return { text: JSON.stringify({ title: "A public post", body: "A public forum body with enough detail.", anonymous: true }) };
  },
});
assert.equal(generated.threads.length, 1);
assert.equal(capturedRequests.length, 1);
const integratedPrompt = capturedRequests[0].message;
assert.match(integratedPrompt, /PUBLIC FORUM POST COGNITIVE CONTEXT|Integrated public event|Integrated world: Public world fact/);
assert.doesNotMatch(integratedPrompt, /Integrated private event/);
assert.equal(integratedPrompt.includes(relation.id), false);
assert.equal(integratedPrompt.includes(relation.userIdentityId), false);

const legacyRequests: Array<{ message: string; systemInstruction: string }> = [];
await generateForumThreads({
  ownerIdentityId: relation.userIdentityId,
  count: 1,
  trigger: "lazy",
  preferredRelationId: relation.id,
  relationships: [relation],
  characters: [character],
  messages: [],
  memories: [],
  worldBookEntries: [],
  existingThreads: [],
  settings,
  now: 13,
  random: () => 0.9,
  aiCall: async (request) => {
    legacyRequests.push(request);
    return { text: JSON.stringify({ title: "Legacy post", body: "A legacy public forum body with enough detail.", anonymous: true }) };
  },
});
assert.match(legacyRequests[0].message, /PUBLIC FORUM POST COGNITIVE CONTEXT/, "the service builds an empty safe context by default");
assert.doesNotMatch(legacyRequests[0].message, /Private event|Relationship event|Private setting/);

console.log("PASS public Forum post prompt adapter public filtering, service integration, identifier redaction, and legacy fallback");
