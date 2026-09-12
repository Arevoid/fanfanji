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

const repairedGenericReflection = buildCharacterPhoneBrowserDetail({
  id: "search-generic-reflection",
  query: "发烧了吃什么东西好得快",
  title: "关于“发烧了吃什么东西好得快”的搜索结果",
  reflection: "我刚刚搜“发烧了吃什么东西好得快”，不是突然想做功课……是这件事已经卡在眼前了。先找个能用的答案，剩下的再慢慢想。",
  timestamp: 3,
}, "周树生", "克制，做事很有条理");
assert.notEqual(repairedGenericReflection.reflection, "我刚刚搜“发烧了吃什么东西好得快”，不是突然想做功课……是这件事已经卡在眼前了。先找个能用的答案，剩下的再慢慢想。", "replaces the legacy one-size-fits-all browser heart voice");
assert.match(repairedGenericReflection.reflection, /发烧了吃什么东西好得快/);

const repairedPreviousFallback = buildCharacterPhoneBrowserDetail({
  id: "search-previous-fallback",
  query: "微博小号怎么隐藏不被发现",
  title: "关于“微博小号怎么隐藏不被发现”的搜索结果",
  reflection: "先把“微博小号怎么隐藏不被发现”里最关键的那一段弄明白，其他的等有空再补。周树生不想因为一个小问题一直卡着。",
  timestamp: 4,
}, "周树生");
assert.notEqual(repairedPreviousFallback.reflection, "先把“微博小号怎么隐藏不被发现”里最关键的那一段弄明白，其他的等有空再补。周树生不想因为一个小问题一直卡着。", "replaces the previously shipped fallback template");
assert.match(repairedPreviousFallback.reflection, /边界|小号|微博|底线|信任|隐藏|留痕/);

const privacyReflections = [
  "女朋友要手机密码该不该给",
  "微博小号怎么隐藏不被发现",
  "怎么解释自己有个情感树洞小号",
].map((query) => buildCharacterPhoneBrowserDetail({
  id: `search-${query}`,
  query,
  title: `关于“${query}”的搜索结果`,
  timestamp: 5,
}, "周树生").reflection);
assert.equal(new Set(privacyReflections).size, privacyReflections.length, "different privacy searches should not reuse one heart-voice sentence");

const unsafeSourceDetail = buildCharacterPhoneBrowserDetail({
  ...apiEntry,
  sourceUrl: "javascript:alert(1)",
}, "步随影");
assert.match(unsafeSourceDetail.sourceUrl, /^https:\/\/zh\.wikipedia\.org\//);

const cloudflareDocsDetail = buildCharacterPhoneBrowserDetail({
  id: "search-cloudflare-docs",
  query: "Cloudflare 使用教程",
  title: "关于“Cloudflare 使用教程”的搜索结果",
  summary: "Cloudflare 可用于缓存和保护网站，配置时应先确认域名与 DNS 设置。",
  results: [
    { platform: "官方文档", title: "Cloudflare 配置指南", snippet: "先确认域名状态，再按文档完成 DNS 配置。" },
    { platform: "技术社区", title: "常见配置问题", snippet: "逐项核对缓存和证书设置即可。" },
  ],
  timestamp: 5.5,
}, "步随影");
assert.equal(cloudflareDocsDetail.error, undefined, "normal Cloudflare documentation must remain a normal result");
assert.equal(cloudflareDocsDetail.results.length, 2);

const cloudflareDetail = buildCharacterPhoneBrowserDetail({
  id: "search-cloudflare",
  query: "最新资讯",
  title: "关于“最新资讯”的搜索结果",
  summary: "<!doctype html><html><head><title>Attention Required! | Cloudflare</title></head><body>Sorry, you have been blocked. Ray ID: abc123</body></html>",
  reflection: "Cloudflare 暂时挡住了网页。",
  results: [
    { platform: "Cloudflare", title: "Attention Required", snippet: "<html><body>Checking your browser before accessing...</body></html>" },
  ],
  timestamp: 6,
}, "步随影");
assert.equal(cloudflareDetail.error?.code, "cloudflare_block");
assert.equal(cloudflareDetail.results.length, 0, "blocked HTML must not reach result cards");
assert.equal(cloudflareDetail.sourceLabel, "网页访问受限");
assert.match(cloudflareDetail.summary, /拒绝访问|未能加载/);
assert.doesNotMatch(`${cloudflareDetail.summary}\n${cloudflareDetail.reflection}\n${cloudflareDetail.sourceLabel}`, /Cloudflare|Ray ID|<html|blocked/i);

const htmlErrorDetail = buildCharacterPhoneBrowserDetail({
  id: "search-html-error",
  query: "网页",
  title: "关于“网页”的搜索结果",
  summary: "<html><body>Unexpected HTML error document</body></html>",
  timestamp: 7,
}, "步随影");
assert.equal(htmlErrorDetail.error?.code, "html_error");
assert.equal(htmlErrorDetail.results.length, 0);

const statusErrorCases = [
  ["403 Forbidden", "http_403", 403],
  ["429 Too Many Requests", "http_429", 429],
  ["500 Internal Server Error", "http_5xx", 500],
  ["502 Bad Gateway", "http_5xx", 502],
  ["503 Service Unavailable", "http_5xx", 503],
  ["504 Gateway Timeout", "http_5xx", 504],
] as const;
for (const [message, code, status] of statusErrorCases) {
  const detail = buildCharacterPhoneBrowserDetail({
    id: `search-${status}`,
    query: "目标网站",
    title: "关于“目标网站”的搜索结果",
    summary: message,
    timestamp: status,
  }, "步随影");
  assert.equal(detail.error?.code, code);
  assert.equal(detail.error?.status, status);
  assert.equal(detail.results.length, 0);
  assert.doesNotMatch(detail.summary, new RegExp(String(status)));
}

console.log("character phone browser detail tests passed");
