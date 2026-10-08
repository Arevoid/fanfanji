import assert from "node:assert/strict";
import { getVoiceMessagePreview, isVoiceMessageContent } from "../src/features/chat/services/voiceMessageContent";

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

console.log("PASS voice message content parsing and translation source contract");
