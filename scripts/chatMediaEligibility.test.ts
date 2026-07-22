import assert from "node:assert/strict";
import type { Character, Message } from "../src/types";
import {
  hasExplicitVoicePreference,
  isExplicitVoiceRequest,
  shouldAutomaticallyConvertTextToVoice,
} from "../src/features/chat/services/voiceMessageEligibility";
import type { AutomaticVoiceConversionInput } from "../src/features/chat/services/voiceMessageEligibility";

const character = (overrides: Partial<Character> = {}): Character => ({
  id: "character-a",
  name: "角色A",
  avatar: "🙂",
  personality: "沉稳克制，平时使用文字聊天",
  backstory: "",
  ...overrides,
});

const message = (overrides: Partial<Message> = {}): Message => ({
  id: "message",
  characterId: "character-a",
  sender: "user",
  content: "今天怎么样？",
  timestamp: 1,
  ...overrides,
});

const eligible = (overrides: Partial<AutomaticVoiceConversionInput> = {}) =>
  shouldAutomaticallyConvertTextToVoice({
    character: character(),
    lastUserMessage: message(),
    recentMessages: [message()],
    bubbleIndex: 0,
    bubbleText: "我还好，刚忙完。",
    random: () => 0,
    ...overrides,
  });

assert.equal(eligible(), false, "ordinary chat remains text by default");
assert.equal(eligible({ character: character({ voiceFrequency: "high" }) }), true, "explicit voice preference may use voice");
assert.equal(eligible({ lastUserMessage: message({ content: "给我发条语音吧" }) }), true, "explicit user request bypasses cooldown");
assert.equal(eligible({ bubbleText: "（轻轻叹气）" }), false, "bracketed narration never becomes voice");
assert.equal(eligible({ bubbleIndex: 1, character: character({ voiceFrequency: "high" }) }), false, "only one automatic voice bubble may be created per reply");
assert.equal(eligible({
  character: character({ voiceFrequency: "high" }),
  recentMessages: [message(), message({ sender: "character", content: "[语音]|3|上一条语音" })],
}), false, "a recent character voice blocks another automatic voice");
assert.equal(eligible({ character: character({ voiceFrequency: "none" }), lastUserMessage: message({ content: "用语音说" }) }), false, "explicitly disabled automatic voice stays disabled");
assert.equal(isExplicitVoiceRequest("我想听你的声音"), true);
assert.equal(hasExplicitVoicePreference(character({ personality: "很爱发语音" })), true);
console.log("PASS character media policy keeps ordinary replies as text and protects explicit voice cases");
