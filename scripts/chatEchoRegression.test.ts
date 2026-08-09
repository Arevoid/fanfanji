import assert from "node:assert/strict";
import fs from "node:fs";
import { isLowInformationUserEcho } from "../src/features/chat/services/chatEchoGuard";

const chatSource = fs.readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(chatSource, /\[CURRENT-SCENE CONTINUITY\]/);
assert.doesNotMatch(chatSource, /sceneAnchorTranscript|Recent scene facts:/);

assert.equal(isLowInformationUserEcho("老公我错了嘛", "我错了"), true);
assert.equal(isLowInformationUserEcho("啊？", "啊"), true);
assert.equal(isLowInformationUserEcho("老公我错了嘛", "没怪你，过来抱一下"), false);
assert.equal(isLowInformationUserEcho("晚安", "晚安"), false);
assert.equal(isLowInformationUserEcho("哈哈", "哈哈"), false);

console.log("chat echo regression tests passed");
