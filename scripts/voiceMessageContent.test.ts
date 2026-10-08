import assert from "node:assert/strict";
import { getVoiceMessagePreview, getVoiceMessageSummary, isVoiceMessageContent, normalizeVoiceTranslation } from "../src/features/chat/services/voiceMessageContent";

assert.deepEqual(getVoiceMessagePreview("[语音]|18|Hello, how are you?"), {
  duration: 18,
  transcript: "Hello, how are you?",
});
assert.deepEqual(getVoiceMessagePreview('[语音: "晚安" (5秒)]'), {
  duration: 5,
  transcript: "晚安",
});
assert.equal(getVoiceMessagePreview("[语音]|8|").transcript, "");
assert.equal(getVoiceMessagePreview("plain transcript").transcript, "plain transcript");
assert.equal(isVoiceMessageContent("[语音]|3|你好"), true);
assert.equal(isVoiceMessageContent("你好", true), true);
assert.equal(isVoiceMessageContent("你好"), false);
assert.equal(getVoiceMessageSummary("[语音]|18|Hello, how are you?"), '语音 18"');
assert.equal(getVoiceMessageSummary('[语音: "晚安" (5秒)]'), '语音 5"');
assert.equal(normalizeVoiceTranslation("[语音]|4|饭饭先生……！"), "饭饭先生……！");
assert.equal(normalizeVoiceTranslation("普通翻译"), "普通翻译");
assert.equal(normalizeVoiceTranslation("普通翻译\\\"}"), "普通翻译");

console.log("PASS voice message content parsing and translation source contract");
