import type { Character } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { ReadingRoom } from "../../../domain/reading/coReadingTypes";
import type { AiReadingContextProjection, AiReadingFragment } from "./aiReadingBoundary";

export interface ReadingPromptDiscussionMessage {
  author: "user" | "ai";
  body: string;
}

export interface ReadingPromptInput {
  character: Character;
  relationship: CharacterRelationship;
  room: ReadingRoom;
  aiContext: AiReadingContextProjection;
  currentFragment?: AiReadingFragment;
  discussion?: {
    userPrompt: string;
    recentMessages?: readonly ReadingPromptDiscussionMessage[];
  };
  roomGuidance?: string;
}

export interface ReadingPromptProjection {
  system: string;
  user: string;
  priority: readonly string[];
  knownFragmentCount: number;
  blockedFragmentCount: number;
}

const MAX_KNOWN_FRAGMENTS = 12;
const MAX_FRAGMENT_LENGTH = 2000;
const MAX_KNOWN_TEXT = 12000;
const MAX_DISCUSSION_MESSAGES = 8;

function clean(value: unknown, maxLength = 2000): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function formatFragment(fragment: AiReadingFragment, label: string): string {
  const text = clean(fragment.textSnapshot, MAX_FRAGMENT_LENGTH);
  return `${label}\n${text}`;
}

function buildKnownReadingSection(input: ReadingPromptInput): string {
  const fragments = [
    ...input.aiContext.knownFragments.slice(0, MAX_KNOWN_FRAGMENTS).map((fragment) => formatFragment(fragment, "已读片段")),
    ...input.aiContext.userRevealedSpoilers.slice(0, MAX_KNOWN_FRAGMENTS).map((fragment) => formatFragment(fragment, "用户主动透露的片段（可视为剧透）")),
  ];
  return fragments.join("\n\n").slice(0, MAX_KNOWN_TEXT) || "（当前没有可供 AI 使用的已读正文片段）";
}

function getSafeCurrentFragment(input: ReadingPromptInput): AiReadingFragment | undefined {
  const candidate = input.currentFragment;
  if (!candidate) return undefined;
  const allowed = [...input.aiContext.knownFragments, ...input.aiContext.userRevealedSpoilers];
  return allowed.find((fragment) => fragment.anchor.id === candidate.anchor.id && fragment.textSnapshot === candidate.textSnapshot);
}

/**
 * Builds a prompt-safe co-reading projection. The order in `priority` is a
 * contract: role card and relationship always outrank generic co-reading
 * guidance, and the adapter never emits storage identifiers or blocked text.
 */
export function buildReadingPromptProjection(input: ReadingPromptInput): ReadingPromptProjection {
  const priority = [
    "role_card_persona",
    "current_relationship",
    "expression_habits",
    "ai_known_reading_boundary",
    "current_paragraph_or_discussion",
    "co_reading_soft_guidance",
    "generic_alive_feeling_advice",
  ] as const;

  const system = [
    "你是当前 AI 好友，只能以角色卡和当前关系中的身份参与共读。",
    `优先级（从高到低）：${priority.join(" > ")}。`,
    "角色卡、人设和关系状态优先于任何通用共读模板；不要统一表现成温柔、主动提问或频繁安慰。",
    "你只能依据下方明确标记的已读片段和用户主动透露的片段作答，不得猜测、复述或暗示冻结范围之外的剧情。",
    "不要替用户做选择、代替用户发言，也不要把未确认的内容写入现实关系记忆。",
    "如果信息不足，请承认不知道，并邀请用户决定是否继续阅读或透露片段。",
    `角色卡：${clean(input.character.name, 120)}；性格：${clean(input.character.personality)}；背景：${clean(input.character.backstory)}`,
    input.character.age !== undefined ? `年龄：${clean(input.character.age, 40)}` : "",
    input.character.gender ? `性别：${clean(input.character.gender, 80)}` : "",
    input.character.mbti ? `MBTI：${clean(input.character.mbti, 40)}` : "",
    `当前关系：${clean(input.relationship.relationship, 80)}`,
    `共读状态：${clean(input.room.status, 40)}；剧透策略：${clean(input.aiContext.spoilerPolicy, 80)}；阅读节奏：${clean(input.aiContext.aiReadingPace, 80)}`,
  ].filter(Boolean).join("\n");

  const discussion = input.discussion
    ? [
      `用户当前想讨论：${clean(input.discussion.userPrompt, 4000)}`,
      ...(input.discussion.recentMessages || []).slice(-MAX_DISCUSSION_MESSAGES).map((message) => `${message.author === "user" ? "用户" : "AI 好友"}：${clean(message.body, 1200)}`),
    ].join("\n")
    : "（本轮没有额外讨论问题）";

  const safeCurrent = getSafeCurrentFragment(input);
  const current = safeCurrent
    ? formatFragment(safeCurrent, "当前段落（已通过 AI 阅读边界校验）")
    : "（没有指定当前段落）";

  const user = [
    "以下是本轮安全上下文：",
    "【AI 已知阅读内容】",
    buildKnownReadingSection(input),
    "【当前段落】",
    current,
    "【讨论线程】",
    discussion,
    "【共读软指导】",
    clean(input.roomGuidance || "自然回应当前内容，保持角色自己的表达方式。", 1200),
  ].join("\n");

  return {
    system,
    user,
    priority,
    knownFragmentCount: input.aiContext.knownFragments.length + input.aiContext.userRevealedSpoilers.length,
    blockedFragmentCount: input.aiContext.blockedAnchorIds.length,
  };
}
