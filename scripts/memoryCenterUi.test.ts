import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppMemory.tsx", import.meta.url), "utf8");

assert.doesNotMatch(source, /记忆类型概览/);
assert.doesNotMatch(source, /role="tablist"/);
assert.doesNotMatch(source, /来源应用筛选/);
assert.match(source, /搜索记忆条目/);
assert.match(source, /selectedCharacterId/);
assert.match(source, /筛选记忆类型/);
assert.match(source, /MEMORY_CENTER_TYPE_OPTIONS/);
assert.match(source, /recordType: activeRecordType/);
assert.match(source, /aria-expanded=\{showTypeFilter\}/);
assert.match(source, /flex w-12 shrink-0 flex-col items-center/);
assert.match(source, /className="h-8 w-8 rounded-full border border-slate-200 object-cover"/);
assert.ok(source.indexOf("Character filter stays above search") < source.indexOf("Search and optional type filter"));
assert.match(source, /长期记忆内容/);
assert.doesNotMatch(source, /兼容记忆条目/);
assert.match(source, /暂无符合条件的记忆/);
assert.match(source, /filteredMemoryCenterRecords\.map\(renderMemoryCenterRecord\)/);
assert.doesNotMatch(source, /filteredCompatibilityMemories\.map/);
assert.match(source, /记忆详情/);
assert.match(source, /来源追溯/);
assert.match(source, /toggleMemoryCenterRecall/);
assert.match(source, /暂停只影响未来检索/);
assert.match(source, /不参与召回/);
assert.match(source, /状态不可召回/);
assert.match(source, /不会参与未来检索/);
assert.match(source, /record\.status !== "active"/);
assert.match(source, /archiveStats\.acceptedTruthCount/);
assert.match(source, /archiveStats\.rejectedCandidateCount/);
assert.match(source, /来源消息 \{immediateSummaryTask\.archiveStats\.sourceMessageCount\} 条/);

console.log("PASS memory center unified list and filters");
