import assert from "node:assert/strict";
import { getCallTranslationParts } from "../src/features/chat/services/callTranscriptTranslation";

assert.deepEqual(
  getCallTranslationParts("[语音]|3|Hello", "你好", "voice"),
  { speech: "你好" },
);
assert.deepEqual(
  getCallTranslationParts("[画面]|A room\n[台词]|Hello", "[画面]|一间房\n[台词]|你好", "video"),
  { scene: "一间房", speech: "你好" },
);
assert.deepEqual(
  getCallTranslationParts("[视频说话]|Hello", "你好", "video"),
  { speech: "你好" },
);

console.log("PASS call transcript translation normalization");
