import assert from "node:assert/strict";
import { isExplicitIncomingCallRequest, isExplicitVoiceCallRequest } from "../src/features/chat/services/voiceCallIntent";

assert.equal(isExplicitVoiceCallRequest("打吧"), true);
assert.equal(isExplicitVoiceCallRequest("给我打个电话"), true);
assert.equal(isExplicitVoiceCallRequest("你拨过来吧"), true);
assert.equal(isExplicitVoiceCallRequest("不要打电话"), false);
assert.equal(isExplicitVoiceCallRequest("晚点再给我打电话"), false);
assert.equal(isExplicitVoiceCallRequest("我给朋友打电话"), false);
assert.equal(isExplicitVoiceCallRequest("我给你打电话"), true);
assert.equal(isExplicitVoiceCallRequest("手机密码是什么"), false);
assert.equal(isExplicitIncomingCallRequest("不小心挂了，你重新给我打一下"), true);
assert.equal(isExplicitIncomingCallRequest("你回拨过来吧"), true);
assert.equal(isExplicitIncomingCallRequest("我给你打电话"), false);
assert.equal(isExplicitIncomingCallRequest("你打字慢一点"), false);
assert.equal(isExplicitIncomingCallRequest("晚点再给我打"), false);

console.log("PASS explicit call requests route to the real voice-call lifecycle");
