import assert from "node:assert/strict";
import { isExplicitVoiceCallRequest } from "../src/features/chat/services/voiceCallIntent";

assert.equal(isExplicitVoiceCallRequest("打吧"), true);
assert.equal(isExplicitVoiceCallRequest("给我打个电话"), true);
assert.equal(isExplicitVoiceCallRequest("你拨过来吧"), true);
assert.equal(isExplicitVoiceCallRequest("不要打电话"), false);
assert.equal(isExplicitVoiceCallRequest("晚点再给我打电话"), false);
assert.equal(isExplicitVoiceCallRequest("我给朋友打电话"), false);
assert.equal(isExplicitVoiceCallRequest("我给你打电话"), true);
assert.equal(isExplicitVoiceCallRequest("手机密码是什么"), false);

console.log("PASS explicit call requests route to the real voice-call lifecycle");
