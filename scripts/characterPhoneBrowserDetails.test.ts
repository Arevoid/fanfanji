import assert from "node:assert/strict";
import { buildCharacterPhoneBrowserDetail } from "../src/features/characterPhone/characterPhoneBrowserDetails";

const apiEntry = {
  id: "search-api",
  query: "Claude API 额度充值",
  title: "关于“Claude API 额度充值”的搜索结果",
  timestamp: 1,
};
const apiDetail = buildCharacterPhoneBrowserDetail(apiEntry, "步随影");
assert.match(apiDetail.summary, /API/);
assert.match(apiDetail.reflection, /额度|账单/);
assert.equal(apiDetail.results.length, 3);
assert.deepEqual(apiDetail.results.map((result) => result.platform), ["维基百科", "知乎", "小红书"]);
assert.match(apiDetail.sourceUrl, /zh\.wikipedia\.org/);

const legacyDetail = buildCharacterPhoneBrowserDetail({
  id: "search-legacy",
  query: "",
  title: "关于“夜间散步”的搜索结果",
  timestamp: 2,
}, "步随影");
assert.match(legacyDetail.summary, /百科式|基本定义/);
assert.match(legacyDetail.reflection, /夜间散步/);
assert.equal(legacyDetail.results.length, 3);

const cachedDetail = buildCharacterPhoneBrowserDetail({
  ...apiEntry,
  summary: "缓存的简易答案",
  reflection: "缓存的角色心声",
  results: [
    { platform: "豆瓣", title: "缓存标题", snippet: "缓存摘要" },
    { platform: "知乎", title: "缓存问题", snippet: "缓存回答" },
  ],
  sourceUrl: "https://example.test/source",
  sourceLabel: "已保存来源",
}, "步随影");
assert.equal(cachedDetail.summary, "缓存的简易答案");
assert.equal(cachedDetail.reflection, "缓存的角色心声");
assert.deepEqual(cachedDetail.results, [
  { platform: "豆瓣", title: "缓存标题", snippet: "缓存摘要" },
  { platform: "知乎", title: "缓存问题", snippet: "缓存回答" },
]);
assert.equal(cachedDetail.sourceUrl, "https://example.test/source");
assert.equal(cachedDetail.sourceLabel, "已保存来源");

const unsafeSourceDetail = buildCharacterPhoneBrowserDetail({
  ...apiEntry,
  sourceUrl: "javascript:alert(1)",
}, "步随影");
assert.match(unsafeSourceDetail.sourceUrl, /^https:\/\/zh\.wikipedia\.org\//);

console.log("character phone browser detail tests passed");
