import type { KnowledgeKind, KnowledgeSubject, TemporalStatus } from "../../../domain/characterKnowledge/characterKnowledgeTypes";

export interface KnowledgeExtractionHistoryItem {
  id: string;
  role: "user" | "model";
  text: string;
}
export interface ExtractedKnowledgeCandidatePayload {
  statement: string;
  /** Optional user-facing diary phrasing; never used as the factual claim. */
  memoryText?: string;
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
    ...(nonEmpty(value.memoryText) ? { memoryText: value.memoryText.trim().slice(0, 2000) } : {}),
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
  characterProfile?: string;
  history: readonly KnowledgeExtractionHistoryItem[];
  templateType?: "refined" | "delicate";
  scenario?: "offline";
}): string {
  const history = input.history.map((item) =>
    `[messageId=${JSON.stringify(item.id)}][${item.role === "user" ? "user" : "character"}] ${item.text}`,
  ).join("\n");
  const offlineRules = input.scenario === "offline" ? `
7. 当前材料是用户手动确认同步的、单角色线下 continue 剧情。该段剧情已被用户确认为这段关系中真实发生的共同经历，因此可以引用 user 和 character 两侧消息来提取剧情中明确发生的事件；这项许可只适用于当前线下材料，不能扩展到导演模式、IF 分支或其他聊天。
8. 只保留会影响后续关系连续性的关键记忆：已完成的重要事件、用户明确表达的偏好、关系状态变化、承诺或未来约定。忽略衣着外观、开门过程、姿势、逐句对话、情绪流水账和其他转瞬即逝的场景细节。
9. statement 必须使用“用户”和角色名“${input.characterName}”固定主体，禁止使用我、你、他、她、我们等指代；准确写清谁做了什么、对谁做、结果是什么，禁止交换主体与客体。
10. 亲密事件只记录是否发生、是否为双方自愿以及关系意义，使用简洁非露骨表述，不记录身体部位、过程、姿势或色情细节。
11. 每条记忆必须有原文证据。共同事件或关系变化可以引用多条 sourceMessageIds；evidenceQuote 仍须逐字来自其中一条。不要把调情、试探、提问、假设或单方面愿望误写成已经发生的事实。
12. 输出 1 至 8 条，按重要性排序。相近台词合并为一个原子事件，不复述原话，不输出标题、内部标记或解释。` : "";
  const delicateRules = input.templateType === "delicate" ? `
【细腻版展示文本】
除客观 statement 外，每条 JSON 必须增加 "memoryText"。memoryText 是角色“${input.characterName}”写给自己看的第一人称私密日记片段：
- 角色“${input.characterName}”做的事写“我”，用户做的事写“{{user}}”；先逐句核对原文主体，绝对不能互换行为、台词、感受或决定的归属。
- 保持角色的人设、语气、口癖和真实情绪，片段之间按事件顺序衔接，读起来像同一篇日记，而不是客观项目清单。
- 只围绕【关键事件】【情感转折】【重要信息】；删除“你好”“在吗”等寒暄。可以保留与情绪或关系变化直接相关的过程细节，例如特殊穿着、来访、告白前后的反应。
- memoryText 可以对已有情绪作角色化表达，但不得新增原文没有的人物、事件、地点、承诺、心理结论或关系状态；不确定就省略。
- statement 仍必须是第三人称、主体明确的事实依据；memoryText 不参与事实判定，不能替代 statement。

角色资料（只用于模仿人设与口吻，不得把资料中的背景设定冒充本次发生的事件）：
<character_profile>
${(input.characterProfile || "未提供额外资料").slice(0, 6000)}
</character_profile>` : `
【精炼版展示文本】
不要输出 memoryText；只输出第三人称、主体明确、条理清晰的客观事件 statement。`;
  return `你是长期知识候选提取器。你只能从带 messageId 的原始消息中提出候选，不能补写或猜测。

对话：
${history}

逐行输出 JSON（JSONL），不要 Markdown、标题或解释。每行格式：
{"statement":"第三人称原子化事实","memoryText":"仅细腻版需要的角色第一人称日记片段","kind":"fact|preference|plan|belief|hypothesis","subject":"user|character|relationship|other","temporalStatus":"past|present|future|timeless|unknown","sourceMessageIds":["精确消息ID"],"evidenceQuote":"源消息中的连续原文"}

规则：
1. evidenceQuote 必须逐字出现在所引用的一条消息中；找不到原文就不要输出。
2. 普通聊天中，用户属性、偏好和经历只能引用 user 消息；角色消息不能证明用户事实或共同经历。线下确认剧情按下方专用规则处理。
3. “以后、希望、打算、计划”使用 plan + future；“如果、假如、也许、可能”使用 hypothesis，不能写成 past fact。
4. 普通聊天中的问句、建议、括号动作、系统指令、想象和角色扮演不输出；已确认线下剧情中的实际完成事件按专用规则处理。
5. 一条候选只表达一个命题；普通聊天最多 5 条；没有可靠候选时输出空文本。
6. statement 可以规范表达，但不能超出 evidenceQuote 与所引用 sourceMessageIds 原文共同支持的含义。
${offlineRules}
${delicateRules}`;
}
