import type { KnowledgeKind, KnowledgeSubject, TemporalStatus } from "../../../domain/characterKnowledge/characterKnowledgeTypes";

export interface KnowledgeExtractionHistoryItem {
  id: string;
  role: "user" | "model";
  text: string;
}
export interface ExtractedKnowledgeCandidatePayload {
  statement: string;
  kind: KnowledgeKind;
  subject: KnowledgeSubject;
  temporalStatus: TemporalStatus;
  sourceMessageIds: string[];
  evidenceQuote: string;
}

const KINDS = new Set<KnowledgeKind>(["fact", "preference", "plan", "belief", "hypothesis"]);
const SUBJECTS = new Set<KnowledgeSubject>(["user", "character", "relationship", "other"]);
const TEMPORAL = new Set<TemporalStatus>(["past", "present", "future", "timeless", "unknown"]);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function normalizeExtractedKnowledgeCandidate(
  value: unknown,
  allowedMessageIds: ReadonlySet<string>,
): ExtractedKnowledgeCandidatePayload | undefined {
  if (!isRecord(value)
    || !nonEmpty(value.statement)
    || !KINDS.has(value.kind as KnowledgeKind)
    || !SUBJECTS.has(value.subject as KnowledgeSubject)
    || !TEMPORAL.has(value.temporalStatus as TemporalStatus)
    || !Array.isArray(value.sourceMessageIds)
    || value.sourceMessageIds.length === 0
    || value.sourceMessageIds.some((id) => !nonEmpty(id) || !allowedMessageIds.has(id.trim()))
    || !nonEmpty(value.evidenceQuote)) return undefined;
  return {
    statement: value.statement.trim(),
    kind: value.kind as KnowledgeKind,
    subject: value.subject as KnowledgeSubject,
    temporalStatus: value.temporalStatus as TemporalStatus,
    sourceMessageIds: Array.from(new Set((value.sourceMessageIds as string[]).map((id) => id.trim()))),
    evidenceQuote: value.evidenceQuote.trim(),
  };
}

export function parseKnowledgeExtractionOutput(
  rawText: string,
  allowedMessageIds: ReadonlySet<string>,
): ExtractedKnowledgeCandidatePayload[] {
  const text = rawText.trim().replace(/^```(?:json|jsonl)?\s*/iu, "").replace(/\s*```$/u, "");
  if (!text) return [];
  const rawValues: unknown[] = [];
  try {
    const parsed = JSON.parse(text) as unknown;
    rawValues.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  } catch {
    for (const line of text.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean)) {
      try {
        rawValues.push(JSON.parse(line) as unknown);
      } catch {
        // Legacy bullets and invalid JSON never become long-term knowledge.
      }
    }
  }
  return rawValues
    .map((value) => normalizeExtractedKnowledgeCandidate(value, allowedMessageIds))
    .filter((value): value is ExtractedKnowledgeCandidatePayload => value !== undefined);
}

export function buildKnowledgeExtractionPrompt(input: {
  characterName: string;
  history: readonly KnowledgeExtractionHistoryItem[];
  scenario?: "offline";
}): string {
  const history = input.history.map((item) =>
    `[messageId=${JSON.stringify(item.id)}][${item.role === "user" ? "user" : "character"}] ${item.text}`,
  ).join("\n");
  return `你是长期知识候选提取器。你只能从带 messageId 的原始消息中提出候选，不能补写、猜测或把角色自己的话当作用户事实。

对话：
${history}

逐行输出 JSON（JSONL），不要 Markdown、标题或解释。每行格式：
{"statement":"原子化陈述","kind":"fact|preference|plan|belief|hypothesis","subject":"user|character|relationship|other","temporalStatus":"past|present|future|timeless|unknown","sourceMessageIds":["精确消息ID"],"evidenceQuote":"源消息中的连续原文"}

规则：
1. evidenceQuote 必须逐字出现在所引用的一条消息中；找不到原文就不要输出。
2. 用户属性、偏好和经历只能引用 user 消息。角色消息不能证明用户事实或共同经历。
3. “以后、希望、打算、计划”使用 plan + future；“如果、假如、也许、可能”使用 hypothesis，不能写成 past fact。
4. 问句、建议、括号动作、系统指令、想象和角色扮演不输出。
5. 一条候选只表达一个命题；最多 5 条；没有可靠候选时输出空文本。
6. statement 可以规范表达，但不能超出 evidenceQuote 的含义。
${input.scenario === "offline" ? "7. 当前是用户确认的线下 continue 交接；仍只允许引用用户明确输入，不提取 AI 补写的地点、动作或场景。" : ""}`;
}
