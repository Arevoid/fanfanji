import assert from "node:assert/strict";
import { LIVING_HUMAN_PROMPT, LIVING_HUMAN_PROMPT_VERSION, MOMENT_CHARACTER_EXPRESSION_PROMPT } from "../src/utils/livingPrompt";
import { CHARACTER_PERSONA_PROTECTION } from "../src/domain/prompt/characterPromptProjector";

assert.equal(LIVING_HUMAN_PROMPT_VERSION, "内置活人感 2.0");
assert.match(LIVING_HUMAN_PROMPT, /只是即时聊天的软性表达检查/);
assert.match(LIVING_HUMAN_PROMPT, /不定义角色、关系、事实、冷暖、话量或世界设定/);
assert.match(LIVING_HUMAN_PROMPT, /不要把万能问候或统一关心句当作所有好友的默认反应/);
assert.match(CHARACTER_PERSONA_PROTECTION, /热情、黏人、话痨/);
assert.match(CHARACTER_PERSONA_PROTECTION, /角色卡的明确设定为准/);
assert.equal(LIVING_HUMAN_PROMPT.includes("优先短而有内容"), false, "2.0 must not impose brevity over persona");
assert.equal(LIVING_HUMAN_PROMPT.includes("15%-25%"), false, "2.0 must not prescribe generic topic jumping");
assert.equal(LIVING_HUMAN_PROMPT.includes("允许敷衍"), false, "2.0 must not prescribe generic perfunctory replies");
assert.equal(LIVING_HUMAN_PROMPT.includes("优先理解并回应"), false, "shared guidance must not force the same comforting response");
assert.equal(LIVING_HUMAN_PROMPT.includes("默认不用 Unicode emoji"), false, "shared guidance must not force one media style on every character");
assert.match(LIVING_HUMAN_PROMPT, /若当前回复原封不动换给另一位好友|换给另一位好友也完全成立/);
assert.match(MOMENT_CHARACTER_EXPRESSION_PROMPT, /朋友圈评论也必须先服从该角色的人设/, "Moment comments must inherit persona priority");
assert.match(MOMENT_CHARACTER_EXPRESSION_PROMPT, /称呼、亲疏、情感倾向、口癖和禁用口吻/, "Moment comments must keep voice consistency");

console.log("PASS living prompt 2.0: style-only responsibility and single-source persona protection");
