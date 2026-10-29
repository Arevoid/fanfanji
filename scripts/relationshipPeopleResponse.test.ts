import assert from "node:assert/strict";
import { parseRelationshipPeople } from "../src/features/relationshipNetwork/services/generateRelationshipPeople";
const source = "李老师是小舟的导师。";
const row = { name: "李老师", evidence: source, relationship: "导师", summary: '喜欢读《集合{与}数组[ ]》、说"你好"。' };
const payload = JSON.stringify({ people: [row] });
for (const wrapper of [payload, `\uFEFF${payload}`, `\`\`\`json\n${payload}\n\`\`\``, `以下是提取结果：\n\`\`\`json\n${payload}\n\`\`\`\n提取完毕。`, `结果：${payload}`, JSON.stringify(payload), JSON.stringify([row]), `<think>此处不是展示内容</think>\n${payload}`]) {
  assert.equal(parseRelationshipPeople(wrapper, source)[0].name, "李老师");
  assert.equal(parseRelationshipPeople(wrapper, source)[0].summary, row.summary);
}
assert.deepEqual(parseRelationshipPeople('{"people":[]}', source), []);
assert.throws(() => parseRelationshipPeople(payload.slice(0, -2), source), /不完整/);
assert.throws(() => parseRelationshipPeople('这是普通说明，没有结构化结果', source), /无法解析/);
assert.throws(() => parseRelationshipPeople(JSON.stringify({ people: [{ ...row, evidence: "没有发生的事" }] }), source), /依据/);
assert.throws(() => parseRelationshipPeople(JSON.stringify({ people: [{ ...row, name: "不存在的人物" }] }), source), /依据/);
assert.throws(() => parseRelationshipPeople('The prompt could not be submitted. The prompt contains sensitive words that violate Google’s Generative AI Prohibited Use policy.', source), /内容策略/);
console.log("PASS real-world JSON framing without extra API calls, truncated salvage or evidence weakening");
