import assert from "node:assert/strict";
import { LIVING_HUMAN_PROMPT, LIVING_HUMAN_PROMPT_VERSION, MOMENT_CHARACTER_EXPRESSION_PROMPT } from "../src/utils/livingPrompt";
import { LIVING_HUMAN_PROMPT as ORIGINAL_LIVING_HUMAN_PROMPT } from "../src/utils/livingPrompt.original";

assert.equal(LIVING_HUMAN_PROMPT_VERSION, "内置活人感 2.0");
assert.match(LIVING_HUMAN_PROMPT, /只负责让已确定的角色表达更像真实聊天/);
assert.match(LIVING_HUMAN_PROMPT, /不定义、不压制、不修正角色的人设/);
assert.match(LIVING_HUMAN_PROMPT, /若本提示词与它们有任何冲突，忽略本提示词/);
assert.match(LIVING_HUMAN_PROMPT, /万能问句填补空白/);
assert.match(LIVING_HUMAN_PROMPT, /热情、黏人、话痨/);
assert.match(LIVING_HUMAN_PROMPT, /不得用默认 friend 削弱/);
assert.match(LIVING_HUMAN_PROMPT, /回复长短、气泡数量、主动性和情绪强度都服从具体人设/);
assert.equal(LIVING_HUMAN_PROMPT.includes("优先短而有内容"), false, "2.0 must not impose brevity over persona");
assert.equal(LIVING_HUMAN_PROMPT.includes("15%-25%"), false, "2.0 must not prescribe generic topic jumping");
assert.equal(LIVING_HUMAN_PROMPT.includes("允许敷衍"), false, "2.0 must not prescribe generic perfunctory replies");
assert.match(ORIGINAL_LIVING_HUMAN_PROMPT, /15%-25%/, "the original prompt must remain available for rollback");
assert.match(ORIGINAL_LIVING_HUMAN_PROMPT, /允许敷衍/, "the original prompt backup must be complete");
assert.match(MOMENT_CHARACTER_EXPRESSION_PROMPT, /朋友圈评论也必须先服从该角色的人设/, "Moment comments must inherit persona priority");
assert.match(MOMENT_CHARACTER_EXPRESSION_PROMPT, /称呼、亲疏、情感倾向、口癖和禁用口吻/, "Moment comments must keep voice consistency");

console.log("PASS living prompt 2.0: persona priority, constrained conflict language, and original backup");
