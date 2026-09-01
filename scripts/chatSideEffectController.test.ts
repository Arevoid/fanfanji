import { strict as assert } from "node:assert";
import type { Character, Message, OfflineStory } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import {
  createChatSideEffectController,
  markChatInitiated,
  markChatRead,
  touchRelationshipSession,
} from "../src/features/chat/controllers/chatSideEffectController";

const userMessage = {
  id: "user-1",
  characterId: "character-1",
  sender: "user",
  content: "hello",
  timestamp: 1,
} as Message;
const assistantMessage = {
  id: "assistant-1",
  characterId: "character-1",
  sender: "character",
  content: "hi",
  timestamp: 2,
} as Message;
const character = {
  id: "character-1",
  enableAutoSummary: true,
  summaryTriggerRound: 1,
  album: [],
} as Character;
const relationship = {
  id: "relation-1",
  lastImmediateSummaryMsgId: undefined,
} as CharacterRelationship;
const relationships = [relationship];

const scheduled: Array<() => void | Promise<void>> = [];
let savedOfflineStory: OfflineStory | undefined;
let extractedMessages: Message[] = [];
let savedRelationships: CharacterRelationship[] = [];
const offlineStory = {
  id: "offline-1",
  messages: [userMessage],
} as OfflineStory;

const controller = createChatSideEffectController({
  offlineStories: [offlineStory],
  onSaveOfflineStory: (story) => {
    savedOfflineStory = story;
  },
  extractMemories: async (messages) => {
    extractedMessages = messages;
    return 1;
  },
  onSaveRelationships: (nextRelationships) => {
    savedRelationships = nextRelationships;
  },
  onSaveCharacter: () => undefined,
  schedule: (task) => {
    scheduled.push(task);
  },
  now: () => 42,
});

controller.afterReplySuccess({
  userMsg: userMessage,
  currentChatMessages: [],
  createdMessages: [assistantMessage],
  activeCharacter: character,
  activeRelationship: relationship,
  relationships,
  isOffline: true,
  activeOfflineStoryId: "offline-1",
});
assert.equal(savedOfflineStory?.messages.length, 2);
assert.equal(savedOfflineStory?.updatedAt, 42);

controller.afterReplySuccess({
  userMsg: userMessage,
  currentChatMessages: [],
  createdMessages: [assistantMessage],
  activeCharacter: character,
  activeRelationship: relationship,
  relationships,
  isOffline: false,
});
assert.equal(scheduled.length, 1);
await scheduled[0]();
assert.deepEqual(extractedMessages.map((message) => message.id), ["user-1", "assistant-1"]);
assert.equal(savedRelationships[0]?.lastImmediateSummaryMsgId, "assistant-1");

const duplicateScheduled: Array<() => void | Promise<void>> = [];
let duplicateCalls = 0;
const duplicateRelationship = { id: "relation-duplicate", lastImmediateSummaryMsgId: undefined } as CharacterRelationship;
const duplicateController = createChatSideEffectController({
  offlineStories: [],
  extractMemories: async () => { duplicateCalls += 1; return 0; },
  onSaveRelationships: () => undefined,
  onSaveCharacter: () => undefined,
  schedule: (task) => { duplicateScheduled.push(task); },
  now: () => 100,
});
const duplicateInput = {
  userMsg: userMessage,
  currentChatMessages: [],
  createdMessages: [assistantMessage],
  activeCharacter: { ...character, id: "character-duplicate" } as Character,
  activeRelationship: duplicateRelationship,
  relationships: [duplicateRelationship],
  isOffline: false,
};
duplicateController.afterReplySuccess(duplicateInput);
duplicateController.afterReplySuccess(duplicateInput);
assert.equal(duplicateScheduled.length, 1, "同一关系的自动归档不能重复排队");
await duplicateScheduled[0]();
assert.equal(duplicateCalls, 1);

const cooldownScheduled: Array<() => void | Promise<void>> = [];
let cooldownCalls = 0;
const cooldownRelationship = { id: "relation-cooldown", lastImmediateSummaryMsgId: undefined } as CharacterRelationship;
const cooldownController = createChatSideEffectController({
  offlineStories: [],
  extractMemories: async () => { cooldownCalls += 1; return -1; },
  onSaveRelationships: () => undefined,
  onSaveCharacter: () => undefined,
  schedule: (task) => { cooldownScheduled.push(task); },
  now: () => 200,
});
const cooldownInput = { ...duplicateInput, activeRelationship: cooldownRelationship, relationships: [cooldownRelationship] };
cooldownController.afterReplySuccess(cooldownInput);
await cooldownScheduled[0]();
cooldownController.afterReplySuccess(cooldownInput);
assert.equal(cooldownScheduled.length, 1, "自动归档失败后应进入冷却，不能每条消息重试");
assert.equal(cooldownCalls, 1);

assert.deepEqual(markChatInitiated([], "chat-1"), ["chat-1"]);
assert.deepEqual(markChatInitiated(["chat-1"], "chat-1"), ["chat-1"]);
assert.deepEqual(markChatRead({}, "chat-1", 10), { "chat-1": 10 });
assert.equal(touchRelationshipSession(relationships, "relation-1", 11)[0]?.lastActiveTime, 11);

console.log("Chat side effect controller: 8 fixed acceptance checks passed");
