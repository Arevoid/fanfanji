import assert from "node:assert/strict";
import { LIVING_HUMAN_PROMPT, LIVING_HUMAN_PROMPT_VERSION, MOMENT_CHARACTER_EXPRESSION_PROMPT } from "../src/utils/livingPrompt";
import { CHARACTER_PERSONA_PROTECTION } from "../src/domain/prompt/characterPromptProjector";

assert.equal(LIVING_HUMAN_PROMPT_VERSION, "内置活人感 2.0");
assert.match(LIVING_HUMAN_PROMPT, /只负责即时聊天的自然表达/);
assert.match(LIVING_HUMAN_PROMPT, /不定义角色、关系、事实或世界设定/);
assert.match(LIVING_HUMAN_PROMPT, /万能问句填补空白/);
assert.match(CHARACTER_PERSONA_PROTECTION, /热情、黏人、话痨/);
assert.match(CHARACTER_PERSONA_PROTECTION, /角色卡的明确设定为准/);
assert.equal(LIVING_HUMAN_PROMPT.includes("优先短而有内容"), false, "2.0 must not impose brevity over persona");
assert.equal(LIVING_HUMAN_PROMPT.includes("15%-25%"), false, "2.0 must not prescribe generic topic jumping");
assert.equal(LIVING_HUMAN_PROMPT.includes("允许敷衍"), false, "2.0 must not prescribe generic perfunctory replies");
assert.match(MOMENT_CHARACTER_EXPRESSION_PROMPT, /朋友圈评论也必须先服从该角色的人设/, "Moment comments must inherit persona priority");
assert.match(MOMENT_CHARACTER_EXPRESSION_PROMPT, /称呼、亲疏、情感倾向、口癖和禁用口吻/, "Moment comments must keep voice consistency");

console.log("PASS living prompt 2.0: style-only responsibility and single-source persona protection");
