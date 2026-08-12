import assert from "node:assert/strict";
import { analyzeConversationFlow } from "../src/domain/prompt/conversationFlow";
import type { Message } from "../src/types";
import { formatChatConversationFlowGuidance } from "../src/features/characterCognitive/promptAdapters/chatPromptAdapter";

const characterId = "character-flow-test";
const message = (id: string, sender: Message["sender"], content: string, timestamp: number): Message => ({
  id,
  characterId,
  sender,
  content,
  timestamp,
});

const sleepThenLaugh = [
  message("u1", "user", "你早点睡吧，晚安", 1),
  message("c1", "character", "好，我收拾一下就睡，你也别熬太晚", 2),
  message("u2", "user", "哈哈", 3),
];
const completed = analyzeConversationFlow(sleepThenLaugh, characterId);
assert.equal(completed.state, "naturally-completed");
assert.equal(completed.shouldTransition, true);
assert.equal(completed.repeatedTopicTurns < 3, true);

const repeatedEvent = [
  message("u1", "user", "你昨天让我等你", 1),
  message("c1", "character", "我知道你还在介意昨天让我等你", 2),
  message("u2", "user", "你昨天骗我睡觉", 3),
  message("c2", "character", "我不是故意让你等我睡觉", 4),
  message("u3", "user", "你昨天说陪我却又让我等", 5),
  message("c3", "character", "我知道，昨天让你等我确实是我不好", 6),
];
const repeated = analyzeConversationFlow(repeatedEvent, characterId);
assert.equal(repeated.shouldTransition, true);
assert.equal(repeated.repeatedTopicTurns >= 3, true);

const question = analyzeConversationFlow([
  message("c1", "character", "你今天吃饭了吗？", 1),
], characterId);
assert.equal(question.state, "needs-follow-up");

const guidance = formatChatConversationFlowGuidance(completed);
assert.match(guidance, /naturally-completed/);
assert.match(guidance, /diagnostics, not a universal limit/);
assert.match(guidance, /this specific character naturally would/);
assert.equal(guidance.includes("relationId"), false);
assert.equal(guidance.includes("Memory"), false);

const ignored = analyzeConversationFlow([
  { ...message("offline", "character", "你昨天让我等你", 1), isOffline: true },
  { ...message("narration", "character", "你昨天让我等你", 2), isNarration: true },
  { ...message("offline-story", "character", "你昨天让我等你", 3), isOffline: true },
], characterId);
assert.equal(ignored.state, "active");
assert.equal(ignored.repeatedTopicTurns, 0);

console.log("PASS chat conversation flow: closure detection, repetition guardrail, follow-up state, and online-only scope");
