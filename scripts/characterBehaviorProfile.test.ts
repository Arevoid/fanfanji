import assert from "node:assert/strict";
import {
  buildCharacterBehaviorPrompt,
  deriveCharacterBehaviorProfile,
  detectCharacterBehaviorSignals,
} from "../src/domain/prompt/characterBehaviorProfile";

const luYanCard = `<陆衍>
## 核心驱动
- 目标：让{{user}}永远留在自己身边。不是“希望”，是“必须”。
## 核心恐惧
- {{user}}交到男朋友，或者任何可能把她从他身边带走的人。
## 性格定义
- 温和型控制者：表面耐心，内里会用照顾和依赖确认关系。
## 语言风格
- 情绪越重，语气越低，问题越具体，不把担心说成夸张的宣言。
## 丰富角色
- {{user}}晚回家时会先确认发生了什么和是否安全。
</陆衍>`;

const profile = deriveCharacterBehaviorProfile({ personality: luYanCard, backstory: "", remark: "" });
assert.equal(profile.isBehaviorDriven, true);
assert.match(profile.coreGoals.join("\n"), /永远留在自己身边/u);
assert.match(profile.coreFears.join("\n"), /男朋友/u);
assert.match(profile.controlStyle.join("\n"), /温和型控制者/u);

const signals = detectCharacterBehaviorSignals({
  profile,
  currentMessage: "我可能晚点回家，朋友送我回家",
});
assert.deepEqual(signals.map((signal) => signal.id), ["late_return", "unknown_companion", "third_party_pickup", "safety_concern"]);
assert.deepEqual(detectCharacterBehaviorSignals({ profile, currentMessage: "嗯，知道了", recentContext: "我晚点回家" }), [], "old trigger context must not repeatedly force interrogation");

const prompt = buildCharacterBehaviorPrompt({
  character: { name: "陆衍", personality: luYanCard, backstory: "", remark: "" },
  currentMessage: "我可能晚点回家，朋友送我回家",
});
assert.match(prompt, /本轮行为计划/u);
assert.match(prompt, /不重复已经回答过的问题/u);
assert.match(prompt, /不要照搬用户举例的句子/u);
assert.match(prompt, /第三方接送/u);

const genericProfile = deriveCharacterBehaviorProfile({
  personality: "一个普通的大学同学，喜欢摄影，聊天随和。",
  backstory: "",
  remark: "",
});
assert.equal(genericProfile.isBehaviorDriven, false);
assert.deepEqual(detectCharacterBehaviorSignals({ profile: genericProfile, currentMessage: "我晚点回家" }), []);
assert.equal(buildCharacterBehaviorPrompt({
  character: { name: "普通同学", personality: "一个普通的大学同学，喜欢摄影，聊天随和。", backstory: "", remark: "" },
  currentMessage: "我晚点回家",
}), "");

console.log("PASS character behavior profile extraction and trigger planning");
