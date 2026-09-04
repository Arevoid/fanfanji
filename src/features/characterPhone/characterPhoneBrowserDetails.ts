import type { CharacterPhoneBrowserEntry, CharacterPhoneBrowserResult } from "../../domain/characterPhone/types";

export interface CharacterPhoneBrowserDetail {
  summary: string;
  reflection: string;
  results: CharacterPhoneBrowserResult[];
  /** Legacy compatibility fields; the UI intentionally does not render an external link. */
  sourceUrl: string;
  sourceLabel: string;
}

type BrowserTopicRule = {
  keywords: string[];
  summary: string;
  reflection: (topic: string) => string;
};

const BROWSER_TOPIC_RULES: BrowserTopicRule[] = [
  {
    keywords: ["api", "claude", "额度", "充值", "账单", "模型"],
    summary: "API 是让应用调用外部服务的接口；额度、计费和限额通常由服务商账户管理，使用前应核对官方价格、套餐和账单规则。",
    reflection: (topic) => `“${topic}”得先查清楚，不然下次又卡在半路只能干等。先把额度和账单看明白，至少心里有底。`,
  },
  {
    keywords: ["天气", "气温", "降雨", "台风"],
    summary: "天气预报会综合观测数据和数值模型，短期趋势通常更可靠；出门前仍应查看当地最新预警和小时预报。",
    reflection: (topic) => `出门前还是看一眼“${topic}”吧。要是带伞就能解决的事，没必要赌。`,
  },
  {
    keywords: ["维基", "百科", "是什么", "定义", "原理"],
    summary: "百科式条目通常先给出概念定义，再补充历史、用途和争议；这类摘要适合快速建立基本认识，细节仍应回到原始资料核对。",
    reflection: (topic) => `我先把“${topic}”看懂，脑子里那团乱才有地方落脚。知道边界以后，再决定要不要继续。`,
  },
  {
    keywords: ["教程", "怎么用", "步骤", "安装", "配置"],
    summary: "教程类资料通常把目标拆成准备条件、操作步骤和常见故障；涉及账号、费用或权限时，应优先使用官方文档。",
    reflection: (topic) => `“${topic}”到底从哪一步开始？先找个能照着做的版本，别再靠猜。`,
  },
];

function normalizeTopic(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function findTopic(entry: CharacterPhoneBrowserEntry): string {
  const query = normalizeTopic(entry.query);
  if (query) return query;
  const title = normalizeTopic(entry.title);
  return title.replace(/^关于[“"]?/, "").replace(/[”"]的搜索结果$/, "") || "这次搜索";
}

function normalizeResult(value: unknown): CharacterPhoneBrowserResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const platform = typeof record.platform === "string"
    ? record.platform.trim().replace(/\s+/g, " ").slice(0, 32)
    : "";
  const title = typeof record.title === "string"
    ? record.title.trim().replace(/\s+/g, " ").slice(0, 100)
    : "";
  const snippet = typeof record.snippet === "string"
    ? record.snippet.trim().replace(/\s+/g, " ").slice(0, 220)
    : "";
  if (!platform || !title || !snippet) return null;
  return { platform, title, snippet };
}

function buildLegacyResults(topic: string, summary: string): CharacterPhoneBrowserResult[] {
  const compactSummary = summary.trim().replace(/\s+/g, " ").slice(0, 220);
  return [
    { platform: "维基百科", title: `关于“${topic}”的资料`, snippet: compactSummary },
    { platform: "知乎", title: `如何理解“${topic}”？`, snippet: `先把问题拆成几个能马上用的小部分：${compactSummary}` },
    { platform: "小红书", title: `“${topic}”实用笔记`, snippet: `如果只是现在要用，先记住这一点：${compactSummary}` },
  ];
}

export function buildCharacterPhoneBrowserDetail(
  entry: CharacterPhoneBrowserEntry,
  _characterName = "我",
): CharacterPhoneBrowserDetail {
  const topic = findTopic(entry);
  const normalized = topic.toLocaleLowerCase();
  const matched = BROWSER_TOPIC_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase())),
  );
  const summary = entry.summary?.trim()
    || matched?.summary
    || `关于“${topic}”的百科式简要整理：先确认它的基本定义、常见用途和注意事项；这只是快速参考，具体内容以原始资料为准。`;
  const reflection = entry.reflection?.trim()
    || matched?.reflection(topic)
    || `我刚刚搜“${topic}”，不是突然想做功课……是这件事已经卡在眼前了。先找个能用的答案，剩下的再慢慢想。`;
  const generatedResults = Array.isArray(entry.results)
    ? entry.results.map(normalizeResult).filter((result): result is CharacterPhoneBrowserResult => Boolean(result)).slice(0, 3)
    : [];
  const cachedSourceUrl = entry.sourceUrl?.trim();
  return {
    summary,
    reflection,
    results: generatedResults.length >= 2 ? generatedResults : buildLegacyResults(topic, summary),
    sourceUrl: cachedSourceUrl && /^https?:\/\//i.test(cachedSourceUrl)
      ? cachedSourceUrl
      : `https://zh.wikipedia.org/w/index.php?search=${encodeURIComponent(topic)}`,
    sourceLabel: entry.sourceLabel?.trim() || "中文维基百科检索入口",
  };
}
