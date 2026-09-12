import type { CharacterPhoneBrowserEntry, CharacterPhoneBrowserResult } from "../../domain/characterPhone/types";

export type CharacterPhoneBrowserErrorCode =
  | "cloudflare_block"
  | "http_403"
  | "http_429"
  | "http_5xx"
  | "http_error"
  | "html_error";

export interface CharacterPhoneBrowserError {
  code: CharacterPhoneBrowserErrorCode;
  status?: number;
}

export interface CharacterPhoneBrowserDetail {
  summary: string;
  reflection: string;
  results: CharacterPhoneBrowserResult[];
  /** Legacy compatibility fields; the UI intentionally does not render an external link. */
  sourceUrl: string;
  sourceLabel: string;
  /** Present only when a saved/generated response is an access/error page. */
  error?: CharacterPhoneBrowserError;
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

function stableVariantIndex(value: string, length: number): number {
  // FNV-1a gives a better spread for short Chinese queries than the old
  // rolling hash.  The reflection is deterministic for a saved search, but
  // different searches should not all land on the first sentence shape.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % length;
}

function buildRoleScopedReflection(topic: string, characterName: string, characterContext = ""): string {
  const searchableText = `${topic} ${characterContext}`.toLocaleLowerCase();
  const privacyTopic = ["密码", "手机", "女朋友", "男朋友", "恋爱", "微博", "小号", "账号", "隐私", "情感", "树洞", "聊天", "秘密", "发现"]
    .some((keyword) => searchableText.includes(keyword));
  const privacyKind = searchableText.includes("情感") || searchableText.includes("树洞") || searchableText.includes("恋爱")
    ? "relationship"
    : searchableText.includes("密码") || searchableText.includes("手机")
    ? "device"
    : searchableText.includes("微博") || searchableText.includes("小号") || searchableText.includes("账号")
      ? "account"
      : "general";
  const healthTopic = ["发烧", "感冒", "咳嗽", "药", "症状", "疼", "医院", "睡不着", "失眠"]
    .some((keyword) => searchableText.includes(keyword));

  // These are deliberately different thoughts rather than one sentence with
  // the query interpolated.  The topic category, role context and query all
  // participate in selection so cached searches keep their own voice.
  const variants = privacyTopic
    ? privacyKind === "device"
      ? [
          `关于“${topic}”，我更在意双方能不能把边界讲清楚，而不是先抢一个标准答案。`,
          `密码这件事先不急着答应或拒绝；信任要有分寸，手机也该留一点自己的空间。`,
          `我把“${topic}”记下来，等情绪平一点再谈。现在下结论，容易把关心说成盘问。`,
          `要不要给出手机密码，得看我们怎么约定，而不是被一句“别人都这样”推着走。`,
          `这不是一道只有对错的题。先想好我愿意分享什么、希望对方尊重什么，再开口。`,
          `${characterName}不想把手机密码变成试探感情的工具，边界说清楚反而轻松。`,
        ]
      : privacyKind === "account"
        ? [
            `小号和公开账号不是一回事；我先确认自己想藏的是内容，还是暂时不想被打扰。`,
            `“${topic}”得先看清平台会留下什么痕迹，别为了省事又把新的把柄送出去。`,
            `我只记下能马上用的隐私设置，剩下的等有空再逐项检查。`,
            `这件事没有万能的隐藏键。先少留痕、再想好被问到时怎么解释。`,
            `搜到“${topic}”了，但我不会照着每条经验全做；账号安全还是要看自己的情况。`,
            `${characterName}先把小号和现实生活分开，能不牵连的地方就别留下线索。`,
          ]
        : privacyKind === "relationship"
          ? [
              `情感树洞可以是出口，也可能变成新的误会。先想好哪些话适合留下，哪些只说给自己听。`,
              `“${topic}”真正难的是怎么开口，不是找一句看起来漂亮的解释。`,
              `我先把这件事放一放，等能平静地说明来龙去脉，再决定要不要分享。`,
              `关系里的秘密没有统一答案；先考虑对方会怎么感受，也别把自己的需要抹掉。`,
              `搜到的建议只能参考，真正要面对的还是我们之间那段具体的经历。`,
              `${characterName}不想用一句话给“${topic}”定性，慢慢说清楚更重要。`,
            ]
          : [
              `这个问题绕不开边界：知道答案不等于一定要去查。先想清楚我想保护什么，再决定下一步。`,
              `“${topic}”看着像在问方法，其实是在衡量信任和分寸。先留一点余地，别把关系推到墙角。`,
              `我把“${topic}”记下来，不急着下结论。现在更重要的是把能承受的后果也想一遍。`,
              `如果真要用到“${topic}”，得先确认不会伤到无辜的人。慢一点，比事后解释轻松。`,
              `这件事不能只看一个标准答案；“${topic}”落到自己身上，边界会完全不一样。`,
              `${characterName}不想把“${topic}”变成一场审问。先把自己的底线说清楚，其他的再谈。`,
            ]
    : healthTopic
      ? [
          `先看“${topic}”里能立刻处理的部分，别把小问题拖成大麻烦。`,
          `搜“${topic}”是想把眼前的不舒服安顿好，不是给自己吓出更多毛病。先记靠谱的那几条。`,
          `我先核对“${topic}”的注意事项，真有不对劲就去问专业的人，别靠猜。`,
          `关于“${topic}”，今天能做的先做一点。剩下的等状态好些，再慢慢看。`,
          `这次搜索只解决当下这一小步；“${topic}”要是反复出现，就不能只靠网页了。`,
          `${characterName}先把“${topic}”放进待办，休息和观察也算处理的一部分。`,
        ]
      : [
          `搜到“${topic}”以后，我先留意它和手头这件事的关系，没必要把每个结果都记住。`,
          `这条搜索是给当下做决定用的；答案够用就停，别让信息把注意力带走。`,
          `“${topic}”先放进备忘里，等事情告一段落再回头核对。`,
          `我想先知道有哪些选择，再决定要不要继续深挖“${topic}”。`,
          `不是每个问题都要马上解决；先收一条靠谱信息，剩下的稍后处理。`,
          `${characterName}先记下“${topic}”的关键处，手头还有别的事要忙。`,
        ];
  return variants[stableVariantIndex(`${characterName}|${characterContext}|${topic}`, variants.length)];
}

function isKnownGenericReflection(value: string): boolean {
  return /^(?:我刚刚搜[“"]?[^”"]+[”"]?，不是突然想做功课|先把“[^”]+”里最关键的那一段弄明白|“[^”]+”刚好碰到眼前|我只是想确认“[^”]+”到底怎么处理|看完“[^”]+”就够做决定了)/.test(value);
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

const CLOUDFLARE_BLOCK_PATTERN = /(?:attention required|just a moment|you(?:'|’)ve been blocked|you have been blocked|checking your browser|cf-chl-|cf-error-details|ray\s+id|enable javascript and cookies|error\s*(?:1006|1007|1008|1015|1020)|(?:blocked|denied|challenged)\s+by\s+cloudflare|cloudflare\s+(?:has\s+)?(?:blocked|denied))/i;
const HTTP_403_PATTERN = /(?:\b403\b\s*(?:error|forbidden|denied|blocked)|(?:http|status|error|response|code)\s*["']?\s*[:#=-]?\s*["']?\s*403\b|\bforbidden\b|\baccess\s+denied\b)/i;
const HTTP_429_PATTERN = /(?:\b429\b\s*(?:error|too\s+many\s+requests|rate\s*limit)|(?:http|status|error|response|code)\s*["']?\s*[:#=-]?\s*["']?\s*429\b|\btoo\s+many\s+requests\b|\brate\s*limit(?:ed|ing)?\b)/i;
const HTTP_5XX_PATTERN = /(?:\b5\d{2}\b\s*(?:error|server|service|gateway|unknown)|(?:http|status|error|response|code)\s*["']?\s*[:#=-]?\s*["']?\s*5\d{2}\b|\binternal\s+server\s+error\b|\bbad\s+gateway\b|\bservice\s+unavailable\b|\bgateway\s+timeout\b|\bweb\s+server\s+is\s+down\b|\borigin\s+(?:is\s+)?unreachable\b|\bconnection\s+(?:timed\s+out|timeout)\b)/i;
const GENERIC_HTTP_ERROR_PATTERN = /(?:\b(?:4\d{2}|5\d{2})\b\s*(?:error|http|status|response)|(?:http|status|error|response|code)\s*["']?\s*[:#=-]?\s*["']?\s*[45]\d{2}\b)/i;
const HTML_ERROR_PATTERN = /(?:<!doctype\s+html|&lt;!doctype\s+html|<\/?(?:html|head|body|title|script|style|meta|iframe|form)\b|&lt;\/?(?:html|head|body|title|script|style|meta|iframe|form)\b)/i;

function readStatusCode(entry: CharacterPhoneBrowserEntry): number | undefined {
  const record = entry as unknown as Record<string, unknown>;
  for (const key of ["status", "statusCode", "httpStatus"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599) return value;
    if (typeof value === "string" && /^\d{3}$/.test(value)) {
      const status = Number(value);
      if (status >= 400 && status <= 599) return status;
    }
  }
  return undefined;
}

function classifyBrowserErrorText(value: string): CharacterPhoneBrowserError | undefined {
  // Keep this scan bounded because persisted entries may come from older or
  // externally generated data. The original text is never returned to UI.
  const text = value.slice(0, 12000);
  const bareStatus = text.match(/^\s*(?:http\s*)?([45]\d{2})\s*$/i);
  if (bareStatus) {
    const status = Number(bareStatus[1]);
    return status === 403
      ? { code: "http_403", status }
      : status === 429
        ? { code: "http_429", status }
        : status >= 500
          ? { code: "http_5xx", status }
          : { code: "http_error", status };
  }
  const cloudflare = CLOUDFLARE_BLOCK_PATTERN.test(text);
  if (cloudflare) return { code: "cloudflare_block" };
  if (HTTP_403_PATTERN.test(text)) return { code: "http_403", status: 403 };
  if (HTTP_429_PATTERN.test(text)) return { code: "http_429", status: 429 };
  if (HTTP_5XX_PATTERN.test(text)) {
    const statusMatch = text.match(/\b(5\d{2})\b/);
    const status = statusMatch ? Number(statusMatch[1]) : undefined;
    return { code: "http_5xx", status };
  }
  if (GENERIC_HTTP_ERROR_PATTERN.test(text)) return { code: "http_error" };
  if (HTML_ERROR_PATTERN.test(text)) return { code: "html_error" };
  return undefined;
}

function findBrowserError(entry: CharacterPhoneBrowserEntry): CharacterPhoneBrowserError | undefined {
  const record = entry as unknown as Record<string, unknown>;
  const status = readStatusCode(entry);
  if (status !== undefined) {
    if (status === 403) return { code: "http_403", status };
    if (status === 429) return { code: "http_429", status };
    if (status >= 500) return { code: "http_5xx", status };
    return { code: "http_error", status };
  }

  // Error details are derived at render time. Generated phone records keep
  // only this existing, safe source label (not the new `error` object), so a
  // later render still shows the friendly state without a storage migration.
  const persistedLabel = entry.sourceLabel?.trim();
  if (persistedLabel === "请求频率受限") return { code: "http_429", status: 429 };
  if (persistedLabel === "网页服务暂时不可用") return { code: "http_5xx" };
  if (persistedLabel === "网页访问受限") return { code: "cloudflare_block" };
  if (persistedLabel === "网页暂时无法打开") return { code: "html_error" };

  // Titles are normally derived from the search query, but older/generated
  // records may have copied an error document title. Only strong HTML/HTTP
  // markers are considered here so a normal search for a site name is safe.
  if (typeof entry.title === "string") {
    const title = entry.title.slice(0, 12000);
    if (CLOUDFLARE_BLOCK_PATTERN.test(title) || HTTP_403_PATTERN.test(title) || HTTP_429_PATTERN.test(title) || HTTP_5XX_PATTERN.test(title) || GENERIC_HTTP_ERROR_PATTERN.test(title) || HTML_ERROR_PATTERN.test(title)) {
      return classifyBrowserErrorText(title);
    }
  }

  const responseTexts: string[] = [];
  for (const value of [entry.summary, entry.sourceLabel, entry.sourceUrl]) {
    if (typeof value === "string" && value.trim()) responseTexts.push(value);
  }
  if (Array.isArray(entry.results)) {
    for (const result of entry.results) {
      if (!result || typeof result !== "object") continue;
      const resultRecord = result as unknown as Record<string, unknown>;
      for (const key of ["platform", "title", "snippet", "summary", "answer"]) {
        const value = resultRecord[key];
        if (typeof value === "string" && value.trim()) responseTexts.push(value);
      }
    }
  }

  for (const value of responseTexts) {
    const error = classifyBrowserErrorText(value);
    if (error) return error;
  }

  // A normal role reflection can mention the search term (including
  // “Cloudflare”), so only treat it as an error source for unmistakable HTML
  // or HTTP error content, never for a bare provider/site name.
  if (typeof record.reflection === "string") {
    const reflection = record.reflection.slice(0, 12000);
    if (HTML_ERROR_PATTERN.test(reflection) || GENERIC_HTTP_ERROR_PATTERN.test(reflection) || HTTP_403_PATTERN.test(reflection) || HTTP_429_PATTERN.test(reflection) || HTTP_5XX_PATTERN.test(reflection)) {
      return classifyBrowserErrorText(reflection);
    }
  }
  return undefined;
}

function buildFriendlyBrowserError(error: CharacterPhoneBrowserError): Pick<CharacterPhoneBrowserDetail, "summary" | "reflection" | "sourceLabel"> {
  if (error.code === "http_429") {
    return {
      summary: "目标网站当前请求过于频繁，搜索结果暂时未能加载。",
      reflection: "网页暂时不肯回应，我先不把它返回的错误页面内容显示出来。稍后再试会更稳妥。",
      sourceLabel: "请求频率受限",
    };
  }
  if (error.code === "http_5xx") {
    return {
      summary: "目标网站暂时出现服务错误，搜索结果未能加载。",
      reflection: "对方网页现在像是出了点故障，我先把原始错误页挡住，免得它占满屏幕。",
      sourceLabel: "网页服务暂时不可用",
    };
  }
  if (error.code === "http_403" || error.code === "cloudflare_block") {
    return {
      summary: "目标网站暂时拒绝访问，搜索结果未能加载。",
      reflection: "网页返回了访问限制，我先不把原始错误页面显示出来。可以稍后重试或换个搜索词。",
      sourceLabel: "网页访问受限",
    };
  }
  return {
    summary: "目标网页返回了无法显示的内容，搜索结果未能加载。",
    reflection: "这次网页没有正常打开，我先把原始错误页面挡住。可以稍后重试或换个搜索词。",
    sourceLabel: "网页暂时无法打开",
  };
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
  characterName = "我",
  characterContext = "",
): CharacterPhoneBrowserDetail {
  const topic = findTopic(entry);
  const cachedSourceUrl = entry.sourceUrl?.trim();
  const sourceUrl = cachedSourceUrl && /^https?:\/\//i.test(cachedSourceUrl)
    ? cachedSourceUrl
    : `https://zh.wikipedia.org/w/index.php?search=${encodeURIComponent(topic)}`;
  const error = findBrowserError(entry);
  if (error) {
    return {
      ...buildFriendlyBrowserError(error),
      results: [],
      sourceUrl,
      error,
    };
  }
  const normalized = topic.toLocaleLowerCase();
  const matched = BROWSER_TOPIC_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase())),
  );
  const summary = entry.summary?.trim()
    || matched?.summary
    || `关于“${topic}”的百科式简要整理：先确认它的基本定义、常见用途和注意事项；这只是快速参考，具体内容以原始资料为准。`;
  const storedReflection = entry.reflection?.trim() || "";
  const reflection = storedReflection && !isKnownGenericReflection(storedReflection)
    ? storedReflection
    : matched?.reflection(topic) || buildRoleScopedReflection(topic, characterName, characterContext);
  const generatedResults = Array.isArray(entry.results)
    ? entry.results.map(normalizeResult).filter((result): result is CharacterPhoneBrowserResult => Boolean(result)).slice(0, 3)
    : [];
  return {
    summary,
    reflection,
    results: generatedResults.length >= 2 ? generatedResults : buildLegacyResults(topic, summary),
    sourceUrl,
    sourceLabel: entry.sourceLabel?.trim() || "中文维基百科检索入口",
  };
}
