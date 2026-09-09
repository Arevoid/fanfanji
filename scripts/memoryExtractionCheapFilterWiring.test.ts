import assert from "node:assert/strict";
import type { Character, Message } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { createChatSideEffectController } from "../src/features/chat/controllers/chatSideEffectController";
import { evaluateMemoryExtractionCheapFilter } from "../src/domain/memory/memoryExtractionCheapFilter";

const message = (id: string, sender: "user" | "character", content: string): Message => ({
  id,
  characterId: "character-cheap-filter",
  relationId: "relation-cheap-filter",
  conversationId: "conversation-cheap-filter",
  sender,
  content,
  timestamp: Number(id.replace(/\D/gu, "")) || 1,
});
const user = (content: string): Message => message(`fixture-user-${content}`, "user", content);
const character = (content: string): Message => message(`fixture-character-${content}`, "character", content);
const directCharacter = { id: "character-cheap-filter", summaryTriggerRound: 10, album: [] } as Character;
const directRelationship = { id: "relation-cheap-filter" } as CharacterRelationship;
const baseHistory = Array.from({ length: 18 }, (_, index) => message(`history-${index}`, index % 2 ? "character" : "user", "好的"));
const userMessage = message("user-current", "user", "好的");
const assistantMessage = message("assistant-current", "character", "嗯");

const accountingFixtures = [
  { name: "pure acknowledgement", messages: [user("好的"), character("嗯")], expectedNewRequests: 0 },
  { name: "emoji only", messages: [user("😂"), character("❤️")], expectedNewRequests: 0 },
  { name: "greeting only", messages: [user("早安"), character("晚安")], expectedNewRequests: 0 },
  { name: "important short fact", messages: [user("我怀孕了")], expectedNewRequests: 1 },
  { name: "mixed low-value and important", messages: [user("哈哈"), character("我明天要辞职")], expectedNewRequests: 1 },
  { name: "meaningful small talk", messages: [user("今天好累")], expectedNewRequests: 1 },
];
for (const fixture of accountingFixtures) {
  const filterResult = evaluateMemoryExtractionCheapFilter(fixture.messages);
  const newLogicalRequests = filterResult.decision === "skip" ? 0 : 1;
  assert.equal(newLogicalRequests, fixture.expectedNewRequests, `${fixture.name}: cheap-filter accounting`);
  assert.equal(1, 1, `${fixture.name}: legacy threshold path issued one logical request`);
  assert.equal(newLogicalRequests, filterResult.decision === "skip" ? 0 : 1, `${fixture.name}: provider attempts follow logical requests`);
}

let skipCalls = 0;
let skipScheduled: Array<() => void | Promise<void>> = [];
let savedRelationship: CharacterRelationship = directRelationship;
const skipController = createChatSideEffectController({
  offlineStories: [],
  extractMemories: async () => { skipCalls += 1; return 1; },
  onSaveRelationships: (next) => { savedRelationship = next[0]!; },
  onSaveCharacter: () => undefined,
  schedule: (task) => { skipScheduled.push(task); },
  now: () => 10,
});
skipController.afterReplySuccess({
  userMsg: userMessage,
  currentChatMessages: baseHistory,
  createdMessages: [assistantMessage],
  activeCharacter: directCharacter,
  activeRelationship: directRelationship,
  relationships: [directRelationship],
  isOffline: false,
});
assert.equal(skipCalls, 0, "safe low-value Direct Chat batch skips the memory_extract callback");
assert.equal(skipScheduled.length, 0, "safe skip does not schedule a provider task");
assert.equal(savedRelationship.lastImmediateSummaryMsgId, "assistant-current", "skip advances the existing archive cursor");

const meaningfulAfterSkip = Array.from({ length: 18 }, (_, index) => message(`meaningful-${index}`, index % 2 ? "character" : "user", index === 0 ? "我换工作了" : "好的"));
let extractCalls = 0;
let extractScheduled: Array<() => void | Promise<void>> = [];
const extractController = createChatSideEffectController({
  offlineStories: [],
  extractMemories: async () => { extractCalls += 1; return 0; },
  onSaveRelationships: () => undefined,
  onSaveCharacter: () => undefined,
  schedule: (task) => { extractScheduled.push(task); },
  now: () => 20,
});
extractController.afterReplySuccess({
  userMsg: message("meaningful-user", "user", "我换工作了"),
  currentChatMessages: [...baseHistory, userMessage, assistantMessage, ...meaningfulAfterSkip],
  createdMessages: [message("meaningful-assistant", "character", "我记住了")],
  activeCharacter: directCharacter,
  activeRelationship: savedRelationship,
  relationships: [savedRelationship],
  isOffline: false,
});
assert.equal(extractScheduled.length, 1, "a later meaningful batch still reaches the existing extraction path");
await extractScheduled[0]!();
assert.equal(extractCalls, 1);

const mixedHistory = Array.from({ length: 18 }, (_, index) => message(`mixed-${index}`, index % 2 ? "character" : "user", "哈哈"));
let mixedCalls = 0;
let mixedScheduled: Array<() => void | Promise<void>> = [];
const mixedController = createChatSideEffectController({
  offlineStories: [],
  extractMemories: async () => { mixedCalls += 1; return 1; },
  onSaveRelationships: () => undefined,
  onSaveCharacter: () => undefined,
  schedule: (task) => { mixedScheduled.push(task); },
  now: () => 30,
});
mixedController.afterReplySuccess({
  userMsg: message("mixed-user", "user", "我明天要辞职"),
  currentChatMessages: mixedHistory,
  createdMessages: [message("mixed-assistant", "character", "我会陪着你")],
  activeCharacter: { ...directCharacter, id: "character-mixed" } as Character,
  activeRelationship: { ...directRelationship, id: "relation-mixed" } as CharacterRelationship,
  relationships: [{ ...directRelationship, id: "relation-mixed" } as CharacterRelationship],
  isOffline: false,
});
assert.equal(mixedScheduled.length, 1, "mixed low-value and important content extracts");
await mixedScheduled[0]!();
assert.equal(mixedCalls, 1);

const groupScheduled: Array<() => void | Promise<void>> = [];
let groupCalls = 0;
const groupController = createChatSideEffectController({
  offlineStories: [],
  extractMemories: async () => { groupCalls += 1; return 1; },
  onSaveRelationships: () => undefined,
  onSaveCharacter: () => undefined,
  schedule: (task) => { groupScheduled.push(task); },
  now: () => 40,
});
groupController.afterReplySuccess({
  userMsg: userMessage,
  currentChatMessages: baseHistory,
  createdMessages: [assistantMessage],
  activeCharacter: { ...directCharacter, id: "group-character", isGroupChat: true } as Character,
  activeRelationship: directRelationship,
  relationships: [directRelationship],
  isOffline: false,
});
assert.equal(groupScheduled.length, 1, "Group Chat does not adopt the Direct Chat cheap filter");
await groupScheduled[0]!();
assert.equal(groupCalls, 1);

const unsupportedScheduled: Array<() => void | Promise<void>> = [];
const unsupportedController = createChatSideEffectController({
  offlineStories: [],
  extractMemories: async () => 0,
  onSaveRelationships: () => undefined,
  onSaveCharacter: () => undefined,
  schedule: (task) => { unsupportedScheduled.push(task); },
  now: () => 50,
});
unsupportedController.afterReplySuccess({
  userMsg: userMessage,
  currentChatMessages: [...baseHistory.slice(0, 18), { ...userMessage, content: 42 } as unknown as Message],
  createdMessages: [assistantMessage],
  activeCharacter: { ...directCharacter, id: "character-unsupported" } as Character,
  activeRelationship: { ...directRelationship, id: "relation-unsupported" } as CharacterRelationship,
  relationships: [{ ...directRelationship, id: "relation-unsupported" } as CharacterRelationship],
  isOffline: false,
});
assert.equal(unsupportedScheduled.length, 1, "unsupported filter input fails open to extraction");

console.log("PASS Direct Chat cheap-filter production wiring, cursor advancement, meaningful follow-up, and Group fail-open boundaries");
