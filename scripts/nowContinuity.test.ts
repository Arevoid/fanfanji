import assert from "node:assert/strict";
import { enforceNowContinuity, getNowActionLabel, hasVisibleTransitionEvidence, normalizeSingleMomentContent } from "../src/domain/now/nowContinuity";
import type { NowScene } from "../src/domain/now/nowTypes";

const previous: NowScene = {
  id: "scene-1",
  threadId: "thread-1",
  ownerIdentityId: "identity-1",
  characterId: "character-1",
  storyAt: 1,
  durationMinutes: 8,
  location: "客厅",
  environment: "灯光偏暗",
  content: "角色坐在沙发上，手机放在膝边。",
  source: "local-fallback",
  createdAt: 1,
  actionType: "still",
  continuityMode: "no-change",
  actionSummary: "坐在沙发上",
  cameraLabel: "客厅固定机位",
  visibleChanges: [],
};

assert.equal(hasVisibleTransitionEvidence({ visibleChanges: [], transitionReason: "" }), false);
assert.equal(hasVisibleTransitionEvidence({ visibleChanges: ["他起身离开画面"], transitionReason: "" }), true);

const blockedTransition = enforceNowContinuity(previous, {
  actionType: "transition",
  continuityMode: "transition",
  actionSummary: "突然走向厨房",
  visibleChanges: [],
});
assert.equal(blockedTransition.continuityMode, "no-change");
assert.equal(blockedTransition.actionType, "still");
assert.equal(blockedTransition.actionSummary, "坐在沙发上");

const naturalTransition = enforceNowContinuity(previous, {
  actionType: "transition",
  continuityMode: "transition",
  actionSummary: "起身离开画面",
  visibleChanges: ["人物从沙发起身并走向门口"],
  transitionReason: "上一动作自然结束",
});
assert.equal(naturalTransition.continuityMode, "transition");
assert.equal(getNowActionLabel(naturalTransition), "自然变化");

const multiMomentContent = "观察时间 01:15，人物坐在窗边，手指停在杯沿。\n\n02:30，人物起身走向厨房。\n\n05:00，房间重新安静下来。";
assert.equal(normalizeSingleMomentContent(multiMomentContent), "人物坐在窗边，手指停在杯沿。");
assert.equal(normalizeSingleMomentContent("观察时间 01:15，人物坐在窗边，手指停在杯沿。"), "人物坐在窗边，手指停在杯沿。");
console.log("now continuity tests passed");
