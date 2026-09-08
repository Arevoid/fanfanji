import type { Character } from "../../types";

/**
 * A compact, runtime-only projection of a character card's behavioural logic.
 *
 * The imported `personality` field remains the complete source document. This
 * projection is deliberately derived at request time so old character cards
 * keep working without a migration and the raw document is never rewritten.
 */
export type CharacterBehaviorTriggerId =
  | "late_return"
  | "unknown_companion"
  | "romantic_rival"
  | "third_party_pickup"
  | "dependency_threat"
  | "safety_concern";

export interface CharacterBehaviorSignal {
  id: CharacterBehaviorTriggerId;
  label: string;
  matchedTerms: string[];
  intensity: "low" | "medium" | "high";
}

export interface CharacterBehaviorProfile {
  /** True only when the source card explicitly supports attachment/control logic. */
  isBehaviorDriven: boolean;
  relationshipRole: string;
  coreGoals: string[];
  coreFears: string[];
  controlStyle: string[];
  speechStyle: string[];
  evidence: string[];
}

export interface CharacterBehaviorPromptInput {
  character: Pick<Character, "name" | "personality" | "backstory" | "remark">;
  currentMessage: string;
  recentContext?: string;
}

const MAX_EVIDENCE_CHARS = 1_800;
const MAX_PROFILE_LIST_ITEMS = 5;

const trimLine = (value: string): string => value
  .replace(/\s+/gu, " ")
  .replace(/^[-*•>\d.、)）]+\s*/u, "")
  .trim();

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[。！？；.!?;])\s*/u)
    .map(trimLine)
    .filter((line) => Boolean(line) && !/^#{1,4}\s+/u.test(line));
}

/** Prefer the role-card body when a document has an author preface outside <角色>…</角色>. */
function extractRoleBody(text: string): string {
  const match = text.match(/<[^>\n]{1,60}>\s*([\s\S]*?)\s*<\/[^>\n]{1,60}>/u);
  return match?.[1]?.trim() || text;
}

function section(text: string, labels: RegExp): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((line) => {
    const heading = line.trim().match(/^#{1,4}\s*(.+?)\s*$/u)?.[1] || "";
    return labels.test(heading);
  });
  if (start < 0) return "";
  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*#{1,4}\s+/u.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join("\n").trim();
}

function uniqueLimited(lines: string[], limit = MAX_PROFILE_LIST_ITEMS): string[] {
  return [...new Set(lines.map(trimLine).filter(Boolean))].slice(0, limit);
}

function pickLines(text: string, patterns: readonly RegExp[], limit = MAX_PROFILE_LIST_ITEMS): string[] {
  return uniqueLimited(splitSentences(text).filter((line) => patterns.some((pattern) => pattern.test(line))), limit);
}

const GOAL_MARKERS = [/目标/u, /必须/u, /永远/u, /唯一/u, /不可替代/u, /让.{0,18}(留在|离不开|需要)/u, /依赖/u];
const FEAR_MARKERS = [/害怕/u, /恐惧/u, /担心/u, /被.{0,12}(带走|抢走|夺走)/u, /男朋友/u, /交往/u, /不再需要/u, /离开/u];
const CONTROL_MARKERS = [/控制/u, /占有/u, /掌控/u, /温和型/u, /照顾/u, /保护/u, /确认/u, /追问/u, /接你/u, /接送/u];
const SPEECH_MARKERS = [/说话/u, /语气/u, /语调/u, /低声/u, /温和/u, /克制/u, /寡言/u, /口吻/u, /称呼/u, /语言/u];
const STRONG_BEHAVIOR_MARKERS = [
  /必须.{0,20}(留|在身边|需要)/u,
  /唯一.{0,16}(不可替代|重要)/u,
  /温和型控制/u,
  /占有欲/u,
  /控制欲/u,
  /不再需要/u,
  /被.{0,12}(带走|抢走|夺走)/u,
];

export function deriveCharacterBehaviorProfile(
  character: Pick<Character, "personality" | "backstory" | "remark">,
): CharacterBehaviorProfile {
  const raw = [character.personality, character.backstory, character.remark].filter(Boolean).join("\n");
  const body = extractRoleBody(raw);
  const goalSection = section(body, /核心驱动|核心目标|驱动/u);
  const fearSection = section(body, /核心恐惧|恐惧|害怕/u);
  const personalitySection = section(body, /性格定义|性格|行为模式/u);
  const speechSection = section(body, /语言风格|说话方式|表达方式/u);
  const relationshipSection = section(body, /关系网|关系|身份/u);
  const richRoleSection = section(body, /丰富角色|特殊反应|触发/u);

  const coreGoals = goalSection
    ? pickLines(goalSection, GOAL_MARKERS)
    : pickLines(body, GOAL_MARKERS, 3);
  const coreFears = fearSection
    ? pickLines(fearSection, FEAR_MARKERS)
    : pickLines(body, FEAR_MARKERS, 3);
  const controlStyle = uniqueLimited([
    ...pickLines(personalitySection, CONTROL_MARKERS),
    ...pickLines(richRoleSection, CONTROL_MARKERS),
    ...(personalitySection || richRoleSection ? [] : pickLines(body, CONTROL_MARKERS, 3)),
  ]);
  const speechStyle = uniqueLimited([
    ...pickLines(speechSection, SPEECH_MARKERS),
    ...pickLines(personalitySection, SPEECH_MARKERS),
  ]);
  const relationshipRole = uniqueLimited(splitSentences(relationshipSection), 2).join("；");
  const evidence = uniqueLimited([
    ...coreGoals,
    ...coreFears,
    ...controlStyle,
    ...speechStyle,
    ...pickLines(richRoleSection, [/晚回家|晚归|男朋友|带走|接你|送你|生气|吃醋|担心/u], 4),
  ], 12);
  const evidenceText = evidence.join("\n").slice(0, MAX_EVIDENCE_CHARS);
  const isBehaviorDriven = STRONG_BEHAVIOR_MARKERS.some((marker) => marker.test(body))
    || (coreGoals.length > 0 && coreFears.length > 0 && controlStyle.length > 0);

  return {
    isBehaviorDriven,
    relationshipRole,
    coreGoals,
    coreFears,
    controlStyle,
    speechStyle,
    evidence: evidenceText ? evidenceText.split("\n").filter(Boolean) : [],
  };
}

interface TriggerDefinition {
  id: CharacterBehaviorTriggerId;
  label: string;
  patterns: readonly RegExp[];
  intensity: CharacterBehaviorSignal["intensity"];
}

const TRIGGER_DEFINITIONS: readonly TriggerDefinition[] = [
  { id: "late_return", label: "用户晚归或回家时间变晚", patterns: [/晚点回家/u, /晚回家/u, /晚归/u, /回去晚/u, /很晚回/u, /晚点到/u], intensity: "medium" },
  { id: "unknown_companion", label: "用户提到未说明身份的同行者", patterns: [/朋友/u, /同学/u, /同事/u, /有人/u, /一起吃饭/u, /出去吃饭/u], intensity: "medium" },
  { id: "romantic_rival", label: "用户提到潜在亲密或竞争对象", patterns: [/男朋友/u, /女朋友/u, /男生/u, /女生/u, /异性/u, /约会/u, /追我/u], intensity: "high" },
  { id: "third_party_pickup", label: "第三方接送或陪同回家", patterns: [/送我回家/u, /接我/u, /有人送/u, /他会送/u, /她会送/u, /送你回家/u, /接你回家/u], intensity: "high" },
  { id: "dependency_threat", label: "用户表达不再需要角色或转向他人", patterns: [/不需要你/u, /不用你/u, /别人陪/u, /有人陪/u, /他比你/u, /她比你/u], intensity: "high" },
  { id: "safety_concern", label: "用户处于需要确认安全的外出状态", patterns: [/注意安全/u, /到地方/u, /路上/u, /回家/u, /一个人/u], intensity: "low" },
];

export function detectCharacterBehaviorSignals(input: {
  profile: CharacterBehaviorProfile;
  currentMessage: string;
  recentContext?: string;
}): CharacterBehaviorSignal[] {
  if (!input.profile.isBehaviorDriven) return [];
  const current = input.currentMessage || "";
  return TRIGGER_DEFINITIONS.flatMap((definition) => {
    const currentMatches = definition.patterns
      .map((pattern) => current.match(pattern)?.[0] || "")
      .filter(Boolean);
    // Recent history is intentionally not enough to create a fresh trigger:
    // otherwise one mention of “回家” would keep interrogating the user for
    // several later turns. The model still receives the normal chat history
    // and can continue an unanswered thread naturally.
    if (!currentMatches.length) return [];
    return [{
      id: definition.id,
      label: definition.label,
      matchedTerms: currentMatches,
      intensity: definition.intensity,
    }];
  });
}

function listBlock(title: string, values: readonly string[]): string {
  return values.length ? `${title}\n${values.map((value) => `- ${value}`).join("\n")}` : "";
}

/** Builds a prompt block only when the card contains explicit behavioural evidence. */
export function buildCharacterBehaviorPrompt(input: CharacterBehaviorPromptInput): string {
  const profile = deriveCharacterBehaviorProfile(input.character);
  if (!profile.isBehaviorDriven) return "";
  const signals = detectCharacterBehaviorSignals({ profile, currentMessage: input.currentMessage, recentContext: input.recentContext });
  const signalBlock = signals.length
    ? `\n[本轮已识别的行为触发]\n${signals.map((signal) => `- ${signal.label}（${signal.intensity}）：${signal.matchedTerms.join("、")}`).join("\n")}`
    : "\n[本轮行为触发]\n- 未发现需要强化的特殊触发；保持角色的稳定底色，不要凭空制造占有或冲突。";
  const evidenceBlock = profile.evidence.length ? `\n[仅供行为推导的角色卡证据]\n${profile.evidence.join("\n")}` : "";
  const triggerGuidance = signals.length
    ? `
[本轮行为计划]
1. 先直接回应用户当前说的事情，再用角色自己的语气处理触发点；不要只回复“嗯/哦/行”。
2. 对晚归、同行者、接送或安全相关信息，优先补齐仍未回答的事实（时间、地点、同行者、是否安全），每轮最多追问 1—3 个最必要的问题，不重复已经回答过的问题。
3. 如果角色卡支持保护或依赖表达，可以提出具体、可执行且不强迫的帮助（例如报平安、到家告知、由角色接送或陪同）；用关心、克制和具体行动体现情绪，不威胁、不囚禁、不替用户做决定。
4. 这是文字聊天：只写角色对用户说的话，不描述角色自己的第三人称动作，也不要替用户回答。
5. 不要照搬用户举例的句子，不要把这些内部标签或分析过程说出来；生成自然、原创、符合关系和上下文的回复。`
    : `
[稳定行为计划]
保持角色卡中明确的关系驱动、表达克制和主动程度；不要为了显得自然而改成通用温柔客服，也不要在没有触发时强行盘问。`;

  return `[ROLE BEHAVIOR PROFILE / 角色行为运行时层：${input.character.name}]
这是一层从完整角色卡临时推导出的行为约束，角色卡原文仍然是最高依据。
优先级：角色卡明确设定 > 当前关系 > 本轮行为触发 > 已确认事实 > 通用活人感建议。
${listBlock("[核心驱动]", profile.coreGoals)}
${listBlock("[核心恐惧]", profile.coreFears)}
${listBlock("[控制/保护方式]", profile.controlStyle)}
${listBlock("[表达方式]", profile.speechStyle)}
${profile.relationshipRole ? `\n[关系身份]\n${profile.relationshipRole}` : ""}${signalBlock}${triggerGuidance}${evidenceBlock}`.replace(/\n{3,}/gu, "\n\n").trim();
}
