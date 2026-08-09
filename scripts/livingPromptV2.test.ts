import assert from "node:assert/strict";
import { LIVING_HUMAN_PROMPT, LIVING_HUMAN_PROMPT_VERSION, MOMENT_CHARACTER_EXPRESSION_PROMPT } from "../src/utils/livingPrompt";
import { LIVING_HUMAN_PROMPT as ORIGINAL_LIVING_HUMAN_PROMPT } from "../src/utils/livingPrompt.original";

assert.equal(LIVING_HUMAN_PROMPT_VERSION, "内置活人感 2.0");
assert.match(LIVING_HUMAN_PROMPT, /角色人设、角色与用户的既定关系/);
assert.match(LIVING_HUMAN_PROMPT, /称呼、亲疏、情感倾向和禁用口吻/);
assert.match(LIVING_HUMAN_PROMPT, /符合人设，或与用户关系更亲密/);
assert.match(LIVING_HUMAN_PROMPT, /不要把人设当成台词解释给用户听/);
assert.match(LIVING_HUMAN_PROMPT, /面对“你好”“在吗”等很短的开场/);
assert.equal(LIVING_HUMAN_PROMPT.includes("15%-25%"), false, "2.0 must not prescribe generic topic jumping");
assert.equal(LIVING_HUMAN_PROMPT.includes("允许敷衍"), false, "2.0 must not prescribe generic perfunctory replies");
assert.match(ORIGINAL_LIVING_HUMAN_PROMPT, /15%-25%/, "the original prompt must remain available for rollback");
assert.match(ORIGINAL_LIVING_HUMAN_PROMPT, /允许敷衍/, "the original prompt backup must be complete");
assert.match(MOMENT_CHARACTER_EXPRESSION_PROMPT, /朋友圈评论也必须先服从该角色的人设/, "Moment comments must inherit persona priority");
assert.match(MOMENT_CHARACTER_EXPRESSION_PROMPT, /称呼、亲疏、情感倾向、口癖和禁用口吻/, "Moment comments must keep voice consistency");

console.log("PASS living prompt 2.0: persona priority, constrained conflict language, and original backup");
