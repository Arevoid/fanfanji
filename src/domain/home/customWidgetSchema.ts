import {
  CUSTOM_WIDGET_SCHEMA_VERSION,
  type CustomWidgetBlock,
  type CustomWidgetDefinition,
  type CustomWidgetSize,
  type CustomWidgetSource,
} from "./customWidgetTypes";

const SIZES: readonly CustomWidgetSize[] = ["1x1", "2x2", "1x4", "2x3", "2x4"];
const THEMES = new Set<CustomWidgetDefinition["theme"]>(["paper", "glass", "midnight", "sunrise"]);
const SOURCES = new Set<CustomWidgetSource>(["manual", "ai", "import"]);

const text = (value: unknown, fallback = "") => typeof value === "string" ? value.trim().slice(0, 1200) : fallback;
const bool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;

function normalizeBlock(raw: unknown): CustomWidgetBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.type === "text") {
    const content = text(value.text);
    return content ? { type: "text", text: content, emphasis: value.emphasis === "title" || value.emphasis === "muted" ? value.emphasis : "normal" } : null;
  }
  if (value.type === "calendar") return { type: "calendar", showLunar: bool(value.showLunar, false), showWeek: bool(value.showWeek, true) };
  if (value.type === "list") {
    const items = Array.isArray(value.items) ? value.items.map((item) => text(item)).filter(Boolean).slice(0, 8) : [];
    return items.length ? { type: "list", title: text(value.title) || undefined, items } : null;
  }
  if (value.type === "quote") {
    const quote = text(value.text);
    return quote ? { type: "quote", text: quote, author: text(value.author) || undefined } : null;
  }
  return null;
}

export function normalizeCustomWidget(input: unknown, options: { id?: string; source?: CustomWidgetSource } = {}): CustomWidgetDefinition | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const now = Date.now();
  const blocks = Array.isArray(value.blocks) ? value.blocks.map(normalizeBlock).filter((block): block is CustomWidgetBlock => Boolean(block)).slice(0, 12) : [];
  if (!blocks.length) return null;
  const id = text(value.id) || options.id || `custom-widget-${now}`;
  const size = SIZES.includes(value.size as CustomWidgetSize) ? value.size as CustomWidgetSize : "2x2";
  const theme = THEMES.has(value.theme as CustomWidgetDefinition["theme"]) ? value.theme as CustomWidgetDefinition["theme"] : "paper";
  const source = SOURCES.has(value.source as CustomWidgetSource) ? value.source as CustomWidgetSource : options.source || "manual";
  const createdAt = typeof value.createdAt === "number" && Number.isFinite(value.createdAt) ? value.createdAt : now;
  const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : now;
  return {
    schemaVersion: CUSTOM_WIDGET_SCHEMA_VERSION,
    id,
    name: text(value.name) || "未命名小组件",
    creator: text(value.creator) || "未署名",
    size,
    theme,
    accentColor: /^#[0-9a-f]{6}$/i.test(text(value.accentColor)) ? text(value.accentColor) : "#7c8fb2",
    blocks,
    source,
    createdAt,
    updatedAt,
  };
}

export function parseCustomWidgetJson(raw: string, options: { id?: string; source?: CustomWidgetSource } = {}): CustomWidgetDefinition | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return normalizeCustomWidget(JSON.parse(cleaned), options);
  } catch {
    return null;
  }
}

export function createFallbackWidget(prompt: string, id = `custom-widget-${Date.now()}`): CustomWidgetDefinition {
  const normalized = prompt.trim();
  const isCalendar = /日历|日期|月历|calendar/i.test(normalized);
  const isTime = /时间|时钟|clock/i.test(normalized);
  const isList = /待办|清单|计划|list|todo/i.test(normalized);
  const blocks: CustomWidgetBlock[] = isCalendar
    ? [{ type: "calendar", showWeek: true, showLunar: /农历|阴历/.test(normalized) }, { type: "text", text: normalized || "我的日历", emphasis: "muted" }]
    : isTime
      ? [{ type: "text", text: normalized || "现在时间", emphasis: "title" }, { type: "calendar", showWeek: true, showLunar: false }]
    : isList
      ? [{ type: "list", title: normalized || "我的清单", items: ["添加第一项", "安排今天的计划"] }]
      : [{ type: "text", text: normalized || "我的小组件", emphasis: "title" }, { type: "quote", text: "从一句话开始，做一个属于你的桌面角落。" }];
  return {
    schemaVersion: CUSTOM_WIDGET_SCHEMA_VERSION,
    id,
    name: isCalendar ? "我的日历" : isTime ? "时间" : isList ? "我的清单" : "我的小组件",
    creator: "未署名",
    size: isCalendar ? "2x2" : isTime ? "1x1" : "2x2",
    theme: "paper",
    accentColor: "#7c8fb2",
    blocks,
    source: "manual",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
