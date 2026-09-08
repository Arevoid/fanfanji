import assert from "node:assert/strict";
import { trackShortTermChatEmotion } from "../src/features/chat/services/chatEmotionTracker";
import { formatChatEmotionGuidance } from "../src/features/characterCognitive/promptAdapters/chatPromptAdapter";
import type { Message } from "../src/types";

const characterId = "emotion-character";
const message = (id: string, sender: Message["sender"], content: string, timestamp: number): Message => ({
  id,
  characterId,
  sender,
  content,
  timestamp,
});

const happy = trackShortTermChatEmotion([
  message("u1", "user", "哈哈，太好了！", 1),
], characterId);
assert.equal(happy.user.emotion, "happy");
assert.ok(happy.user.intensity >= 0.65);
assert.equal(happy.user.decay, false);

const affectionDecay = trackShortTermChatEmotion([
  message("c1", "character", "宝贝，想你了", 1),
  message("c2", "character", "真的很想你，宝贝", 2),
  message("c3", "character", "还是想你，抱抱", 3),
], characterId);
assert.equal(affectionDecay.character.emotion, "affectionate");
assert.equal(affectionDecay.character.decay, true);
assert.ok(affectionDecay.character.intensity <= 0.35, "third repeated expression should decay to a low intensity");

const emotionEnded = trackShortTermChatEmotion([
  message("u1", "user", "我刚刚有点难过", 1),
  message("u2", "user", "好啦，我去忙了，晚点聊", 2),
], characterId);
assert.deepEqual(emotionEnded.user, { emotion: "neutral", intensity: 0, decay: false });

const isolatedInput = [
  { ...message("offline", "user", "我很生气", 1), isOffline: true },
  { ...message("narration", "character", "我很生气", 2), isNarration: true },
] as const;
const before = JSON.stringify(isolatedInput);
const isolated = trackShortTermChatEmotion(isolatedInput, characterId);
assert.equal(JSON.stringify(isolatedInput), before, "tracker must not mutate messages or persist output");
assert.deepEqual(isolated, {
  user: { emotion: "neutral", intensity: 0, decay: false },
  character: { emotion: "neutral", intensity: 0, decay: false },
});

const prompt = formatChatEmotionGuidance(affectionDecay);
assert.match(prompt, /SHORT-TERM EMOTION/);
assert.match(prompt, /affectionate/);
assert.match(prompt, /repetition signal only/);
assert.match(prompt, /character's established pattern/);
assert.equal(prompt.includes("relationId"), false);
assert.equal(prompt.includes("characterId"), false);

console.log("PASS chat emotion tracker: recognition, repeated-emotion decay, closure, and non-persistent scope");
