import assert from "node:assert/strict";
import { buildConversationState } from "../src/features/chat/services/conversationState";
import { formatConversationStateGuidance } from "../src/features/characterCognitive/promptAdapters/chatPromptAdapter";
import type { Message } from "../src/types";

const characterId = "conversation-state-character";
const message = (id: string, sender: Message["sender"], content: string, timestamp: number): Message => ({
  id,
  characterId,
  sender,
  content,
  timestamp,
});

const normal = buildConversationState([message("u1", "user", "我在整理房间", 1)], characterId);
assert.equal(normal.topic.status, "active");
assert.equal(normal.strategy, "continue");
assert.equal(normal.guidance.shouldChangeTopic, false);

const tired = buildConversationState([message("u1", "user", "我今天好累，也有点难过", 1)], characterId);
assert.equal(tired.emotion.userEmotion, "sad");
assert.equal(tired.strategy, "comfort");

const repeatedAffection = buildConversationState([
  message("c1", "character", "宝贝，想你了", 1),
  message("c2", "character", "真的很想你，宝贝", 2),
  message("c3", "character", "还是想你，抱抱", 3),
], characterId);
assert.equal(repeatedAffection.emotion.characterEmotion, "affectionate");
assert.ok(repeatedAffection.emotion.intensity <= 0.35);
assert.equal(repeatedAffection.strategy, "transition");
assert.equal(repeatedAffection.guidance.shouldChangeTopic, true);

const completed = buildConversationState([message("u1", "user", "好啦，我去忙了，晚点聊", 1)], characterId);
assert.equal(completed.topic.status, "naturally-completed");
assert.equal(completed.guidance.shouldChangeTopic, true);

const combined = buildConversationState([
  message("u1", "user", "我今天下班路上遇到一只小猫", 1),
], characterId);
assert.deepEqual(combined, {
  topic: { status: "active" },
  emotion: { userEmotion: "neutral", characterEmotion: "neutral", intensity: 0 },
  strategy: "ask",
  guidance: { shouldChangeTopic: false, shouldAvoidRepetition: false },
});

const prompt = formatConversationStateGuidance(combined);
assert.match(prompt, /CONVERSATION STATE/);
assert.match(prompt, /Topic status: active/);
assert.match(prompt, /Recommended interaction direction: ask/);
assert.equal(prompt.includes("relationId"), false);
assert.equal(prompt.includes("characterId"), false);

console.log("PASS conversation state: flow, emotion, strategy, guidance, and prompt-only scope");
