import assert from "node:assert/strict";
import { mergeRelationshipPersonAliases } from "../src/domain/relationshipNetwork/relationshipPersonAliases";
const rows = [
  { name: "沈韦", relationship: "合作伙伴", evidence: "网名: 韦制，本名: 沈韦，年龄: 34" },
  { name: "韦制", relationship: "朋友", evidence: "工作相关的消息会及时回复韦制。" },
  { name: "姜素棠", relationship: "奶奶", evidence: "姓名：姜素棠，关系：奶奶。" },
  { name: "奶奶", relationship: "奶奶", evidence: "会认真回复奶奶的消息。" },
  { name: "小王", relationship: "朋友", evidence: "小王是朋友。" },
  { name: "小李", relationship: "朋友", evidence: "小李是朋友。" },
];
assert.deepEqual(mergeRelationshipPersonAliases(rows).map(row => row.name), ["沈韦", "姜素棠", "小王", "小李"]);
assert.deepEqual(mergeRelationshipPersonAliases([...rows].reverse()).map(row => row.name).sort(), ["沈韦", "姜素棠", "小王", "小李"].sort());
assert.deepEqual(mergeRelationshipPersonAliases([rows[0], { ...rows[1], evidence: rows[0].evidence }]).map(row => row.name), ["沈韦"]);
const ambiguous = [...rows.slice(2,4), { name: "另一位奶奶", relationship: "奶奶", evidence: "另一位奶奶。" }];
assert.equal(mergeRelationshipPersonAliases(ambiguous).length, 3, "ambiguous family titles must not be guessed");
assert.equal(mergeRelationshipPersonAliases([{ name: "王老师", relationship: "导师", evidence: "王老师是导师。" }, { name: "李老师", relationship: "导师", evidence: "李老师是导师。" }]).length, 2);
console.log("PASS explicit alias and singular kinship deduplication without collapsing unrelated people");
