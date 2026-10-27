import assert from "node:assert/strict";
import { canGenerateCharacterMoment, hasExplicitMomentGenerationRequest } from "../src/domain/moments/momentGenerationPolicy";
for (const enabled of [undefined, true, false]) {
  assert.equal(canGenerateCharacterMoment(enabled, "startup"), false);
  assert.equal(canGenerateCharacterMoment(enabled, "timer"), false);
}
assert.equal(canGenerateCharacterMoment(undefined, "user_requested"), true, "legacy users default enabled");
assert.equal(canGenerateCharacterMoment(true, "user_requested"), true);
assert.equal(canGenerateCharacterMoment(false, "user_requested"), false);
for (const text of ["你好", "我发朋友圈了", "不要发朋友圈", "你发过朋友圈吗", "你会发朋友圈吗"]) assert.equal(hasExplicitMomentGenerationRequest(text), false, text);
for (const text of ["发一条朋友圈吧", "你现在发个朋友圈", "帮我生成一条朋友圈", "Please post a moment"]) assert.equal(hasExplicitMomentGenerationRequest(text), true, text);
console.log("Moments require an explicit user trigger and respect the per-character switch");
