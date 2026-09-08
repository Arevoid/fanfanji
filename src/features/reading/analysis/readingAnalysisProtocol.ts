import type { ReadingAnalysisEntityKind, ReadingAnalysisScope } from "../../../domain/reading/analysisTypes";

export interface ReadingChapterAnalysisPromptInput {
  scope: ReadingAnalysisScope;
  chapterId: string;
  chapterTitle: string;
  chapterText: string;
  previousSummary?: string;
  nextSummary?: string;
}

export interface ReadingChapterAnalysisPrompt {
  system: string;
  user: string;
  chapterTextLength: number;
}

export interface ReadingAnalysisEntityDraft {
  kind: ReadingAnalysisEntityKind;
  name: string;
  aliases: string[];
  summary: string;
  attributes: Record<string, string>;
  confidence: number;
}

export interface ReadingChapterAnalysisResult {
  summary: string;
  keyPoints: string[];
  entities: ReadingAnalysisEntityDraft[];
  premise?: string;
  worldRules?: string[];
  storyLines?: string[];
  timeline?: string[];
}

export type ReadingAnalysisResponseValidation =
  | { ok: true; value: ReadingChapterAnalysisResult }
  | { ok: false; error: string };

const trim = (value: unknown, max: number): string => typeof value === "string" ? value.trim().slice(0, max) : "";
const list = (value: unknown, max: number, itemMax: number): string[] => Array.isArray(value) ? value.filter((item): item is string => Boolean(typeof item === "string" && item.trim())).map((item) => item.trim().slice(0, itemMax)).slice(0, max) : [];
const entityKinds: ReadingAnalysisEntityKind[] = ["character", "location", "faction", "event"];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Builds a chapter-only prompt. Scope IDs are intentionally not serialized. */
export function buildReadingChapterAnalysisPrompt(input: ReadingChapterAnalysisPromptInput): ReadingChapterAnalysisPrompt {
  const chapterText = trim(input.chapterText, 16000);
  if (!chapterText) throw new Error("章节正文不能为空");
  const previous = trim(input.previousSummary, 2000);
  const next = trim(input.nextSummary, 2000);
  return {
    system: "你负责分析一本小说的单个章节。只根据当前章节和明确提供的摘要工作，不得补写未提供的后续剧情，不得把推测当成事实。输出必须是 JSON，不要输出 Markdown。",
    user: [
      `章节：${trim(input.chapterTitle, 500)}`,
      "当前章节正文：",
      chapterText,
      previous ? `前一章节摘要（仅作有限上下文）：\n${previous}` : "",
      next ? `后一章节摘要（仅作有限上下文）：\n${next}` : "",
      "请提取章节摘要、关键要点，以及本章明确出现的人物/地点/势力/事件。置信度使用 0 到 1。",
    ].filter(Boolean).join("\n\n"),
    chapterTextLength: chapterText.length,
  };
}

function parseEntity(raw: unknown): ReadingAnalysisEntityDraft {
  if (!isRecord(raw) || !entityKinds.includes(raw.kind as ReadingAnalysisEntityKind)) throw new Error("实体 kind 无效");
  const name = trim(raw.name, 300);
  const summary = trim(raw.summary, 4000);
  if (!name || !summary) throw new Error("实体缺少名称或摘要");
  const attributes = isRecord(raw.attributes)
    ? Object.fromEntries(Object.entries(raw.attributes).filter(([, value]) => typeof value === "string").slice(0, 30).map(([key, value]) => [key.slice(0, 100), String(value).slice(0, 1000)]))
    : {};
  const confidence = Number(raw.confidence);
  return { kind: raw.kind as ReadingAnalysisEntityKind, name, aliases: list(raw.aliases, 20, 200), summary, attributes, confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5 };
}

/** Validates untrusted model JSON before it can enter the analysis repository. */
export function validateReadingChapterAnalysisResponse(raw: unknown): ReadingAnalysisResponseValidation {
  try {
    if (!isRecord(raw)) throw new Error("分析结果必须是对象");
    const summary = trim(raw.summary, 8000);
    if (!summary) throw new Error("章节摘要不能为空");
    if (raw.keyPoints !== undefined && !Array.isArray(raw.keyPoints)) throw new Error("keyPoints 必须是数组");
    if (raw.entities !== undefined && !Array.isArray(raw.entities)) throw new Error("entities 必须是数组");
    const rawEntities = raw.entities === undefined ? [] : raw.entities as unknown[];
    const entities = rawEntities.slice(0, 100).map(parseEntity);
    return {
      ok: true,
      value: {
        summary,
        keyPoints: list(raw.keyPoints, 30, 500),
        entities,
        ...(trim(raw.premise, 6000) ? { premise: trim(raw.premise, 6000) } : {}),
        ...(raw.worldRules !== undefined ? { worldRules: list(raw.worldRules, 100, 1000) } : {}),
        ...(raw.storyLines !== undefined ? { storyLines: list(raw.storyLines, 100, 1000) } : {}),
        ...(raw.timeline !== undefined ? { timeline: list(raw.timeline, 200, 1000) } : {}),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "分析结果校验失败" };
  }
}
