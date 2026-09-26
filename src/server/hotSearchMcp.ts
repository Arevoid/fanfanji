import { fetchWithTimeout, readResponseTextWithTimeout } from "../utils/fetchWithTimeout";

type HotItem = { rank: number; title: string; hot: number; url: string };
type Platform = "weibo" | "zhihu" | "bilibili" | "baidu" | "toutiao" | "douyin" | "tieba" | "juejin";

const PLATFORM_ORDER: Platform[] = ["weibo", "zhihu", "bilibili", "baidu", "toutiao", "douyin", "tieba", "juejin"];
const PLATFORM_NAMES: Record<Platform, { zh: string; en: string }> = {
  weibo: { zh: "微博热搜", en: "Weibo" }, zhihu: { zh: "知乎热榜", en: "Zhihu" },
  bilibili: { zh: "B站热门", en: "Bilibili" }, baidu: { zh: "百度热搜", en: "Baidu" },
  toutiao: { zh: "头条热榜", en: "Toutiao" }, douyin: { zh: "抖音热点", en: "Douyin" },
  tieba: { zh: "贴吧热议", en: "Tieba" }, juejin: { zh: "掘金热榜", en: "Juejin" },
};
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<Platform, { expiresAt: number; items: HotItem[] }>();
const USER_AGENT = "FanfanjiHotSearch/1.0 (+https://fanfanji.ccwu.cc)";

function item(rank: number, title: unknown, hot: unknown, url: unknown): HotItem | null {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle) return null;
  const numericHot = Number(hot);
  return { rank, title: normalizedTitle, hot: Number.isFinite(numericHot) ? Math.max(0, Math.round(numericHot)) : 0, url: typeof url === "string" ? url : "" };
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const response = await fetchWithTimeout(url, { headers: { Accept: "application/json, text/plain, */*", "User-Agent": USER_AGENT, ...headers } }, 10_000);
  const text = await readResponseTextWithTimeout(response, 10_000);
  if (!response.ok) throw new Error(`上游返回 ${response.status}`);
  return JSON.parse(text);
}

async function fetchPlatform(platform: Platform): Promise<HotItem[]> {
  if (platform === "weibo") {
    const data = await getJson("https://weibo.com/ajax/side/hotSearch", { Referer: "https://weibo.com/" });
    return ((data?.data?.realtime || []) as any[]).map((row, index) => item(index + 1, row?.word || row?.note, row?.num, `https://s.weibo.com/weibo?q=${encodeURIComponent(row?.word || row?.note || "")}`)).filter(Boolean) as HotItem[];
  }
  if (platform === "zhihu") {
    const data = await getJson("https://api.zhihu.com/topstory/hot-lists/total?limit=50", { Referer: "https://www.zhihu.com/" });
    return ((data?.data || []) as any[]).map((row, index) => {
      const title = row?.target?.title;
      const match = String(row?.detail_text || "").match(/\s*([\d.]+)/u);
      return item(index + 1, title, match ? Number(match[1]) * 10000 : 0, `https://www.zhihu.com/question/${row?.target?.id || ""}`);
    }).filter(Boolean) as HotItem[];
  }
  if (platform === "bilibili") {
    const data = await getJson("https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1", { Referer: "https://www.bilibili.com/" });
    return ((data?.data?.list || []) as any[]).map((row, index) => item(index + 1, row?.title, row?.stat?.view, row?.short_link_v2 || row?.short_link || (row?.bvid ? `https://www.bilibili.com/video/${row.bvid}` : ""))).filter(Boolean) as HotItem[];
  }
  if (platform === "baidu") {
    const data = await getJson("https://top.baidu.com/api/board?platform=pc&tab=realtime", { Referer: "https://top.baidu.com/board?tab=realtime" });
    const rows = data?.data?.cards?.[0]?.content || [];
    return (rows as any[]).map((row, index) => { const title = row?.word || row?.title || row?.query; return item(index + 1, title, row?.hotScore, row?.url || `https://www.baidu.com/s?wd=${encodeURIComponent(title || "")}`); }).filter(Boolean) as HotItem[];
  }
  if (platform === "toutiao") {
    const data = await getJson("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc");
    return ((data?.data || []) as any[]).map((row, index) => item(index + 1, row?.Title, row?.HotValue, row?.Url || `https://www.toutiao.com/trending/${row?.ClusterId || row?.ClusterIdStr || ""}/`)).filter(Boolean) as HotItem[];
  }
  if (platform === "douyin") {
    const data = await getJson("https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/");
    return ((data?.word_list || []) as any[]).map((row, index) => item(index + 1, row?.word, row?.hot_value, `https://www.douyin.com/search/${encodeURIComponent(row?.word || "")}`)).filter(Boolean) as HotItem[];
  }
  if (platform === "tieba") {
    const data = await getJson("https://tieba.baidu.com/hottopic/browse/topicList");
    return ((data?.data?.bang_topic?.topic_list || []) as any[]).map((row, index) => item(index + 1, row?.topic_name, row?.discuss_num, row?.topic_url)).filter(Boolean) as HotItem[];
  }
  const data = await getJson("https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot");
  return ((data?.data || []) as any[]).map((row, index) => item(index + 1, row?.content?.title, row?.content_counter?.hot_rank, row?.content?.content_id ? `https://juejin.cn/post/${row.content.content_id}` : "")).filter(Boolean) as HotItem[];
}

async function getPlatform(platform: Platform, limit: number): Promise<HotItem[]> {
  const cached = cache.get(platform);
  if (cached && cached.expiresAt > Date.now()) return cached.items.slice(0, limit);
  const items = await fetchPlatform(platform);
  if (items.length === 0) throw new Error("上游返回空榜单");
  cache.set(platform, { expiresAt: Date.now() + CACHE_TTL_MS, items });
  return items.slice(0, limit);
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "list_platforms") return { platforms: PLATFORM_ORDER.map((slug) => ({ slug, name: PLATFORM_NAMES[slug].zh, name_en: PLATFORM_NAMES[slug].en })), note: "使用 query_hot_trending 获取指定平台或全部平台热榜。" };
  if (name !== "query_hot_trending") throw new Error("未知热搜工具。");
  const platform = String(args.platform || "all").trim().toLowerCase();
  const requestedLimit = Number(args.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, Math.round(requestedLimit))) : 20;
  if (platform === "all") {
    const entries = await Promise.all(PLATFORM_ORDER.map(async (slug) => {
      try { return [slug, await getPlatform(slug, 10)] as const; }
      catch (error) { return [slug, [] as HotItem[], error instanceof Error ? error.message : "获取失败"] as const; }
    }));
    const platforms: Record<string, HotItem[]> = {}; const failed: Record<string, string> = {};
    entries.forEach(([slug, items, error]) => { if (error) failed[slug] = error; else platforms[slug] = items; });
    return { platforms, failed, updated_at: new Date().toISOString(), note: "每个平台返回前 10 条，结果缓存 5 分钟。" };
  }
  if (!PLATFORM_ORDER.includes(platform as Platform)) throw new Error(`不支持的平台：${platform}`);
  return { platform, updated_at: new Date().toISOString(), items: await getPlatform(platform as Platform, limit) };
}

function sse(payload: Record<string, unknown>, sessionId: string): Response {
  const body = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "Mcp-Session-Id": sessionId } });
}

let hotSearchSessionCounter = 0;

function createSessionId(): string {
  hotSearchSessionCounter = (hotSearchSessionCounter + 1) % 1_000_000_000;
  return `fanfanji-hotsearch-${hotSearchSessionCounter.toString(36)}`;
}

export async function handleHotSearchMcp(body: Record<string, unknown>): Promise<Response> {
  const method = typeof body.method === "string" ? body.method : "";
  const id = body.id ?? null;
  const sessionId = createSessionId();
  if (method.startsWith("notifications/")) return new Response(null, { status: 202, headers: { "Cache-Control": "no-store", "Mcp-Session-Id": sessionId } });
  if (method === "initialize") return sse({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fanfanji-hotsearch", version: "1.0.0" } } }, sessionId);
  if (method === "tools/list") return sse({ jsonrpc: "2.0", id, result: { tools: [
    { name: "list_platforms", description: "列出支持的中文热搜平台。", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
    { name: "query_hot_trending", description: "查询微博、知乎、B站、百度、头条、抖音、贴吧、掘金的实时热榜。", inputSchema: { type: "object", properties: { platform: { type: "string", description: "平台 slug，默认 all" }, limit: { type: "integer", minimum: 1, maximum: 50 } } }, annotations: { readOnlyHint: true } },
  ] } }, sessionId);
  if (method === "tools/call") {
    try {
      const params = body.params && typeof body.params === "object" ? body.params as Record<string, unknown> : {};
      const args = params.arguments && typeof params.arguments === "object" ? params.arguments as Record<string, unknown> : {};
      const value = await callTool(String(params.name || ""), args);
      return sse({ jsonrpc: "2.0", id, result: { isError: false, content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value } }, sessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "热搜查询失败。";
      return sse({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: message }] } }, sessionId);
    }
  }
  return sse({ jsonrpc: "2.0", id, error: { code: -32601, message: `不支持的方法：${method}` } }, sessionId);
}
