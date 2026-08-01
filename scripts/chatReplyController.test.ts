import { strict as assert } from "node:assert";
import type { Message } from "../src/types";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { createChatRuntimeContext } from "../src/features/chat/context/chatRuntimeContext";
import type { ChatRuntimeContext } from "../src/features/chat/context/chatRuntimeContext";
import { createChatReplyController } from "../src/features/chat/controllers/chatReplyController";

const userMessage = {
  id: "user-1",
  characterId: "character-1",
  sender: "user",
  content: "hello",
  timestamp: 1,
} as Message;

const calls: string[] = [];
const directContext = createChatRuntimeContext({
  characterId: "character-1",
  relationId: "relation-1",
  conversationId: "direct:relation-1",
  userIdentityId: "identity-1",
});
const cognitiveCharacter = {
  id: "character-1",
  name: "Character",
  avatar: "",
  personality: "precise",
  backstory: "canonical",
};
const cognitiveRelation = createRelationship({
  id: "relation-1",
  characterId: "character-1",
  userIdentityId: "identity-1",
  now: 1,
});
const otherRelation = createRelationship({
  id: "relation-2",
  characterId: "character-1",
  userIdentityId: "identity-2",
  now: 1,
});
const event = (relationId: string, userIdentityId: string, id: string): CharacterEvent => ({
  id,
  relationId,
  characterId: "character-1",
  userIdentityId,
  kind: "relationship_created",
  summary: id,
  source: "relationship",
  occurredAt: 1,
  recordedAt: 1,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
});
const createCognitiveContext = (
  runtimeContext: ChatRuntimeContext,
  relation = cognitiveRelation,
) => buildCharacterCognitiveContext({
  character: cognitiveCharacter,
  relation,
  memories: [
    { id: "memory-1", characterId: "character-1", relationId: cognitiveRelation.id, content: "identity one", timestamp: 1 },
    { id: "memory-2", characterId: "character-1", relationId: otherRelation.id, content: "identity two", timestamp: 1 },
  ],
  events: [
    { event: event(cognitiveRelation.id, cognitiveRelation.userIdentityId, "event-1"), promptVisibility: "safe" },
    { event: event(otherRelation.id, otherRelation.userIdentityId, "event-2"), promptVisibility: "safe" },
  ],
  timeContext: { now: 1 },
  knowledgeBoundary: { known: [], unknown: [] },
  conversationId: runtimeContext.conversationId || relation.conversationId,
});
let receivedCognitiveContext: ReturnType<typeof createCognitiveContext> | undefined;
const directController = createChatReplyController({
  getContext: () => directContext,
  getCognitiveContext: createCognitiveContext,
  generateGroupReply: () => {
    calls.push("group");
  },
  generateDirectReply: ({ context, cognitiveContext, userMsg }) => {
    receivedCognitiveContext = cognitiveContext;
    calls.push(`direct:${context.relationId}:${userMsg?.id}`);
  },
});
await directController.generate({ userMsg: userMessage });
assert.deepEqual(calls, ["direct:relation-1:user-1"]);
assert.deepEqual(receivedCognitiveContext?.knownFacts.map((fact) => fact.id), ["memory-1"]);
assert.deepEqual(receivedCognitiveContext?.recentEvents.map((item) => item.id), ["event-1"]);

const secondDirectContext = createChatRuntimeContext({
  characterId: "character-1",
  relationId: "relation-2",
  conversationId: "direct:relation-2",
  userIdentityId: "identity-2",
});
let receivedSecondCognitiveContext: ReturnType<typeof createCognitiveContext> | undefined;
const secondDirectController = createChatReplyController({
  getContext: () => secondDirectContext,
  getCognitiveContext: (runtimeContext) => createCognitiveContext(runtimeContext, otherRelation),
  generateGroupReply: () => {
    calls.push("unexpected-second-group");
  },
  generateDirectReply: ({ context, cognitiveContext, userMsg }) => {
    receivedSecondCognitiveContext = cognitiveContext;
    calls.push(`direct:${context.relationId}:${userMsg?.id}`);
  },
});
await secondDirectController.generate({ userMsg: userMessage });
assert.deepEqual(receivedSecondCognitiveContext?.knownFacts.map((fact) => fact.id), ["memory-2"]);
assert.deepEqual(receivedSecondCognitiveContext?.recentEvents.map((item) => item.id), ["event-2"]);
assert.equal(receivedSecondCognitiveContext?.knownFacts.some((fact) => fact.id === "memory-1"), false);
assert.equal(receivedSecondCognitiveContext?.recentEvents.some((item) => item.id === "event-1"), false);

const groupController = createChatReplyController({
  getContext: () => createChatRuntimeContext({
    characterId: "group-1",
    conversationId: "group:group-1",
    userIdentityId: "identity-1",
    isGroup: true,
    groupId: "group-1",
  }),
  generateGroupReply: (message) => {
    calls.push(`group:${message?.id}`);
  },
  generateDirectReply: () => {
    calls.push("unexpected-direct");
  },
});
await groupController.generate({ userMsg: userMessage });
assert.deepEqual(calls, ["direct:relation-1:user-1", "direct:relation-2:user-1", "group:user-1"]);

console.log("Chat reply controller: 4 fixed acceptance checks passed");
