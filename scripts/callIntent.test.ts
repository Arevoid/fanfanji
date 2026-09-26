import assert from "node:assert/strict";
import {
  acceptCallIntent,
  createCallIntentId,
  mediaFromCallAction,
  parseCallActionDirective,
  type CallIntent,
} from "../src/features/chat/services/callIntent";

const video = parseCallActionDirective({
  text: "我马上接通。\n[[CALL_ACTION]]{\"type\":\"video_call\",\"reason\":\"你刚刚明确要求视频来电\"}[[/CALL_ACTION]]",
});
assert.equal(video.visibleText, "我马上接通。");
assert.equal(video.directive?.type, "video_call");
assert.equal(mediaFromCallAction(video.directive!.type), "video");

const voice = parseCallActionDirective({
  text: "我现在打给你。\n[[PROACTIVE_ACTION]]{\"type\":\"call\",\"reason\":\"上下文适合语音来电\"}[[/PROACTIVE_ACTION]]",
});
assert.equal(voice.visibleText, "我现在打给你。");
assert.equal(voice.directive?.type, "call");
assert.equal(mediaFromCallAction(voice.directive!.type), "voice");

const malformed = parseCallActionDirective({
  text: "保留这句 [[CALL_ACTION]]坏数据[[/CALL_ACTION]]",
});
assert.equal(malformed.visibleText, "保留这句");
assert.equal(malformed.error, "malformed_json");

const base: CallIntent = {
  id: "",
  direction: "incoming",
  media: "video",
  source: "ai",
  characterId: "char-1",
  relationId: "relation-1",
  responseBatchId: "batch-1",
};
const intentId = createCallIntentId(base);
const registry = new Set<string>();
assert.equal(acceptCallIntent(registry, { ...base, id: intentId }), true);
assert.equal(acceptCallIntent(registry, { ...base, id: intentId }), false);

console.log("PASS canonical call intent parsing and exactly-once registry");
