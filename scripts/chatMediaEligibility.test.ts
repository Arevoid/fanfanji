import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Character, Message } from "../src/types";
import {
  hasExplicitVoicePreference,
  isExplicitVoiceRequest,
  shouldAutomaticallyConvertTextToVoice,
} from "../src/features/chat/services/voiceMessageEligibility";
import type { AutomaticVoiceConversionInput } from "../src/features/chat/services/voiceMessageEligibility";
import { shouldConvertBubbleToVoice } from "../src/features/chat/services/voiceBubbleEligibility";

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
  relationId: "relation-identity-a",
  conversationId: "direct:relation-identity-a",
  sender: "user",
  content: "今天怎么样？",
  timestamp: 1,
  ...overrides,
});

const scope = {
  characterId: "character-a",
  relationId: "relation-identity-a",
  conversationId: "direct:relation-identity-a",
  userIdentityId: "identity-a",
};

const runtimeContext = { ...scope, isGroup: false };

const eligible = (overrides: Partial<AutomaticVoiceConversionInput> = {}) =>
  shouldAutomaticallyConvertTextToVoice({
    character: character(),
    lastUserMessage: message(),
    recentMessages: [message()],
    bubbleIndex: 0,
    bubbleText: "我还好，刚忙完。",
    scope,
    random: () => 0,
    ...overrides,
  });

const scopedMessage = (overrides: Partial<Message> = {}) => message({
  relationId: scope.relationId,
  conversationId: scope.conversationId,
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
assert.equal(eligible({
  character: character({ voiceFrequency: "high" }),
  scope,
  lastUserMessage: scopedMessage(),
  recentMessages: [
    scopedMessage(),
    message({
      sender: "character",
      relationId: "relation-identity-b",
      conversationId: "direct:relation-identity-b",
      content: "[语音]|3|另一套 user 人设里的语音",
    }),
  ],
}), true, "another identity relationship must not activate this relationship's voice cooldown");
assert.equal(eligible({
  scope,
  lastUserMessage: message({
    relationId: "relation-identity-b",
    conversationId: "direct:relation-identity-b",
    content: "给我发条语音吧",
  }),
  recentMessages: [],
}), false, "a voice request from another relationship must not affect the captured reply scope");
assert.equal(eligible({
  character: character({ voiceFrequency: "high" }),
  scope,
  lastUserMessage: scopedMessage(),
  recentMessages: [scopedMessage({ sender: "character", content: "[语音]|3|本关系上一条语音" })],
}), false, "a voice in the same relationship still activates cooldown");
assert.equal(eligible({
  character: character({ voiceFrequency: "high" }),
  scope,
  lastUserMessage: scopedMessage(),
  recentMessages: [message({ sender: "character", relationId: undefined, conversationId: undefined, content: "[语音]|3|未迁移旧语音" })],
}), true, "unscoped legacy messages must not leak into a relationship cooldown");
assert.equal(eligible({
  scope,
  lastUserMessage: scopedMessage({ content: "给我发条语音吧" }),
  recentMessages: [],
}), true, "an explicit request in the captured relationship remains eligible");
assert.equal(isExplicitVoiceRequest("我想听你的声音"), true);
assert.equal(hasExplicitVoicePreference(character({ personality: "很爱发语音" })), true);

assert.equal(shouldConvertBubbleToVoice({
  enabled: false,
  character: character({ voiceFrequency: "high" }),
  lastUserMessage: message({ content: "给我发条语音吧" }),
  recentMessages: [],
  bubbleIndex: 0,
  bubbleText: "你好",
  replyContext: runtimeContext,
}), false, "disabled TTS stays disabled at the UI boundary");
assert.equal(shouldConvertBubbleToVoice({
  enabled: true,
  character: character({ voiceFrequency: "high" }),
  lastUserMessage: message({ content: "给我发条语音吧" }),
  recentMessages: [],
  bubbleIndex: 0,
  bubbleText: "你好",
  replyContext: runtimeContext,
}), true, "the UI boundary forwards a valid direct scope");

const appChatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(appChatSource, /canConvertBubbleToVoice\(turnCharacter, userMsg, messages, idx, bubbleText, replyContext\)/);
assert.match(appChatSource, /canConvertBubbleToVoice\(friend, null, charMsgs, idx, bubbleText, proactiveReplyContext\)/);
assert.doesNotMatch(appChatSource, /shouldConvertBubbleToVoice\(activeCharacter, userMsg, messages/);
console.log("PASS character media policy keeps ordinary replies as text and protects explicit voice cases");
