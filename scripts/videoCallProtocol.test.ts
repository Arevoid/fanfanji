import assert from "node:assert/strict";
import { buildVoiceCallPrompts } from "../src/features/chat/prompts/directChatTurnPrompt";
import { createVideoCallInputMarkup, getVideoCallDisplayText, parseVideoCallInputMarkup, parseVideoCallResponse } from "../src/features/chat/services/videoCallProtocol";

assert.equal(createVideoCallInputMarkup("我把镜头转向窗外", "scene"), "[视频画面]|我把镜头转向窗外");
assert.deepEqual(parseVideoCallInputMarkup("[视频画面]|我把镜头转向窗外"), { mode: "scene", text: "我把镜头转向窗外" });
assert.deepEqual(parseVideoCallResponse("[画面]|他把手机拿近了\n[台词]|你那边也下雨了吗？"), { scene: "他把手机拿近了", speech: "你那边也下雨了吗？" });
assert.deepEqual(parseVideoCallResponse("[画面]|他把手机拿近了 [台词]|你那边也下雨了吗？"), { scene: "他把手机拿近了", speech: "你那边也下雨了吗？" });
assert.deepEqual(parseVideoCallResponse("他把手机拿近了。【台词】你那边也下雨了吗？"), { scene: "他把手机拿近了。", speech: "你那边也下雨了吗？" });
assert.equal(getVideoCallDisplayText("[视频画面]|我转向窗外"), "画面：我转向窗外");
assert.match(buildVoiceCallPrompts(false, "video").join("\n"), /\[画面\]/);
assert.match(buildVoiceCallPrompts(false, "video").join("\n"), /\[台词\]/);
console.log("PASS video-call protocol separates speech, scene input, and persona-aware output");
