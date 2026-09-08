import assert from "node:assert/strict";
import { buildOfflineIdentityBinding, removeSingleActorSelfVocative } from "../src/domain/prompt/offlineIdentityBinding";

const binding = buildOfflineIdentityBinding({ characterNames: ["范千"], userName: "饭饭" });
assert.match(binding, /你负责扮演的角色是：范千/);
assert.match(binding, /用户\/故事主角是：饭饭/);
assert.match(binding, /“我喜欢你”“我喜欢饭饭”/);
assert.match(binding, /严禁让角色 范千 对用户说“范千，我喜欢你”/);
assert.match(binding, /旁白视角设置只约束引号外叙述/);

assert.equal(
  removeSingleActorSelfVocative("范千低头说：“范千，喜欢你。”", "范千"),
  "范千低头说：“喜欢你。”",
);
assert.equal(
  removeSingleActorSelfVocative("范千低头说：「范千：我没骗你。」", "范千"),
  "范千低头说：「我没骗你。」",
);
assert.equal(
  removeSingleActorSelfVocative("范千看着饭饭：“饭饭，我喜欢你。”", "范千"),
  "范千看着饭饭：“饭饭，我喜欢你。”",
);
assert.equal(
  removeSingleActorSelfVocative("旁白里的范千，不应被删除。", "范千"),
  "旁白里的范千，不应被删除。",
);

const sameNameBinding = buildOfflineIdentityBinding({ characterNames: ["小满"], userName: "小满" });
assert.match(sameNameBinding, /重名时必须优先使用“你”/);
assert.doesNotMatch(sameNameBinding, /我喜欢小满/);

console.log("PASS offline character/user identity binding and single-actor self-vocative correction");
