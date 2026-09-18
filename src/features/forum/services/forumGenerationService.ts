import type {
  Character,
  ForumPublicAuthor,
  ForumReply,
  ForumThread,
  ForumCommunityNpc,
  ForumVirtualProfile,
  MemoryItem,
  Message,
  UserIdentity,
  UserSettings,
  WorldBookEntry,
} from "../../../types";
import { createId as createApplicationId } from "../../../core/id/createId";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { isWorldBookEntryVisible } from "../../../domain/worldbook/worldBookVisibility";
import { resolveCanonicalCharacterId } from "../../../domain/character/characterIdentity";
import { apiChat } from "../../../utils/apiHelper";
import { PromptComposer } from "../../../domain/prompt/PromptComposer";
import {
  buildForumProtectedNames,
  buildForumPublicSafeContext,
  findForumPrivateNameViolation,
  isForumGeneratedReplyRelevant,
  validateForumPostStyle,
  validateForumReplyStyle,
} from "../../../domain/forum/forumContentSafety";
import {
  createForumVirtualAuthor,
  getForumVirtualProfile,
} from "../../../domain/forum/forumVirtualProfiles";
import {
  toForumCommunityNpcAuthor,
  toForumCommunityNpcProfile,
} from "../forumCommunityNpcData";
import {
  forumThreadFingerprint,
  isForumThreadDuplicate,
  parseForumReplyCandidate,
  parseForumThreadCandidate,
  type ForumGeneratedReplyCandidate,
  type ForumGeneratedThreadCandidate,
  validateForumReplyTimeline,
} from "../../../domain/forum/forumValidation";
import {
  FORUM_AUTHOR_UPDATE_PROBABILITY,
  FORUM_LIKE_ENGAGEMENT_PROBABILITY,
  FORUM_MANUAL_REFRESH_PROBABILITY,
  FORUM_RELATION_REPLY_PROBABILITY,
  shouldGenerateForumActivity,
} from "../../../domain/forum/forumGenerationGuard";
import { getForumBaselineLikeCount } from "../../../domain/forum/forumData";
import {
  DEFAULT_FORUM_POST_AUTHOR_POLICY,
  canUseRelationshipThreadAuthor,
  chooseForumThreadAuthorKind,
} from "../../../domain/forum/forumPostAuthorPolicy";
import { inferForumStoryArc } from "../../../domain/forum/forumStoryArc";
import { buildPublicForumCognitiveContext } from "../../../domain/publicCognitive/publicContextBuilder";
import type {
  PublicCharacterEventCandidate,
  PublicForumCognitiveContext,
  PublicWorldSettingCandidate,
} from "../../../domain/publicCognitive/publicForumCognitiveTypes";
import {
  buildPublicForumPostPromptContext,
  formatPublicForumPostPromptContext,
} from "../../characterCognitive/promptAdapters/publicForumPostPromptAdapter";
import {
  buildPublicForumReplyPromptContext,
  formatPublicForumReplyPromptContext,
} from "../../characterCognitive/promptAdapters/publicForumReplyPromptAdapter";
import {
  buildPublicForumActivityPromptContext,
  formatPublicForumActivityPromptContext,
} from "../../characterCognitive/promptAdapters/publicForumActivityPromptAdapter";

export interface ForumRelationContext {
  relationship: CharacterRelationship;
  character: Character;
  /** Public-safe topic categories and speaking style; never raw chat or Memory. */
  promptContext: string;
  /** Canonical public style only, used when this character replies to a public thread. */
  publicReplyPersona: string;
  /** Optional public-only context for generated public content. */
  publicCognitiveContext?: PublicForumCognitiveContext;
}

export interface ForumGenerationBundle {
  threads: ForumThread[];
  replies: ForumReply[];
  fingerprints: string[];
}

type ForumAiCall = (params: {
  message: string;
  systemInstruction: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}) => Promise<{ text: string }>;

interface ForumAiRequest {
  message: string;
  systemInstruction: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}

type ForumReplyAuthor =
  | { kind: "relation"; context: ForumRelationContext }
  | { kind: "virtual"; profile: ForumVirtualProfile }
  | { kind: "community-npc"; npc: ForumCommunityNpc; profile: ForumVirtualProfile; publicAuthor: ForumPublicAuthor };

const defaultAiCall: ForumAiCall = (params) => apiChat({ ...params, ...PromptComposer.compose({ scenario: "forum-thread", message: params.message, history: [], systemInstruction: params.systemInstruction }), purpose: "forum_generate" });

const id = (prefix: string): string => createApplicationId(prefix);

const trimContext = (value: string, max = 1800): string =>
  value.trim().slice(0, max);

const FORUM_PUBLIC_TEXT_RULES = `论坛内容只能是普通纯文本。
禁止括号动作、神态、心理描写和角色扮演旁白；禁止[无语]等状态标签。
禁止伪造表情包、图片、语音、视频、附件、Markdown 图片、data URL、聊天分段或时间标记。
不得声称执行点赞、发布、转发、删除、发送媒体等操作。
不得公开输入中未在帖子或公开楼层出现的私人姓名、昵称、身份或可识别细节。
回复必须直接回应主楼主题或指定楼层，不得拼接无关私人故事。`;

export const FORUM_REALISM_RULES = `论坛帖必须像手机端真实用户当下发出的帖子，不是小说、剧本、旁白或完整故事梗概：
- 主楼从一个具体的当下困惑、见闻、吐槽或求助切入，使用第一人称口语；只写目前已知的事实和感受，留一个能让别人接话的问题或判断点。
- 正文通常 30-450 字，分成 1-4 个自然短段；可以省略背景、使用口头禅、重复词、问号、省略号或少量 emoji，但不要堆砌文学修辞。
- 不要按时间线从起因写到结局，不要替评论区把真相和后续全部说完；“连载故事”也只发当前这一段，后续通过楼层和楼主更新推进。
- 禁止“第一章/第X集/故事开始/镜头切到/旁白/后来最终”等章节化、剧本化表达；不要用全知视角描述所有人的心理。
- 不要求每条都反转或悬疑，优先让细节、语气和未解决的问题像真实用户发帖。`;

export const FORUM_REPLY_REALISM_RULES = `每条回复都要像一个真实网友在楼层里顺手留下的话：
- 通常 5-120 字，1-2 句，直接抓住主楼或被引用楼层的一个细节；可以给建议、追问、质疑、补充经验、吐槽或开玩笑，观点要有差异。
- 不要复述整篇主楼，不要写总结、长篇分析、小说段落或替其他用户发言；不要凭空补全未公开的剧情。
- 只有确实在接某一楼时才引用楼层，引用后马上说自己的话；楼主回复应像临时补充一条新事实、纠正前文或改变打算，而不是发布“下一章”。`;

/**
 * These are prompts for exploration, not an allow-list.  A custom category is
 * intentionally allowed to discover new public-life angles as long as its
 * worldview boundary remains intact.
 */
const FORUM_TOPIC_POOL = "情感、恋爱求助、友情与家庭、校园/宿舍/社团、职场、城市生活、租房邻里、消费避坑、影视综艺、作品安利、粉丝社区、打榜应援、公开爆料、狗仔线索、捞人偶遇、同城活动、日常求助、健康经验、数码工具、旅行见闻、吐槽、都市怪谈、树洞、连载故事、事情后续与吃瓜讨论";

const FORUM_TOPIC_POOL_GUIDANCE = `这些只是发散灵感，不是固定题材池，也不是每条都要覆盖的清单。除非世界观明确禁止，帖子可以从任意合理的公共生活切面展开：普通人的小事、观众/粉丝讨论、行业与城市见闻、求助和经验、安利与避坑、八卦与情感都可以。不要因为分类来自某个角色，就只写这个角色、某个道具或世界书里出现过的同一件事。`;

/** Generated public posts alternate their lightweight continuation arc at a
 * 5:5 rate across refresh batches; ordinary posts still receive normal
 * replies and activity, but do not enter the author-update story lane. */
export const FORUM_STORY_POST_RATIO = 0.5;

/** Each newly generated post must start with this many effective replies. */
export const FORUM_INITIAL_REPLY_MIN = 3;
export const FORUM_INITIAL_REPLY_MAX = 8;

const FORUM_DIVERSITY_LENSES = [
  "普通人的当下见闻、邻里、租房、消费或公共服务",
  "影视、综艺、电视剧、作品安利或观众推荐",
  "粉丝社区、打榜、应援、线下活动或追星讨论（世界观允许时）",
  "公开行业消息、采访、爆料线索或狗仔观察（不把未证实传闻写成事实）",
  "校园、职场、同城活动、交通、饮食或旅行经历",
  "求助、经验、设备、健康、维权或生活避坑",
  "捞人、偶遇、社交八卦、情感树洞或关系观察",
  "事情后续、澄清、观点争论或一个尚未解决的新问题",
] as const;

const buildForumDiversityHint = (input: {
  batchIndex: number;
  attempt: number;
  batchOffset: number;
  recentThreads: readonly ForumThread[];
}): string => {
  const lens = FORUM_DIVERSITY_LENSES[(input.batchOffset + input.batchIndex * 2 + input.attempt) % FORUM_DIVERSITY_LENSES.length];
  const recent = input.recentThreads
    .slice(-4)
    .map((thread, index) => `${index + 1}. ${thread.title}：${trimContext(thread.body, 120)}`)
    .join("\n");
  return `本次刷新是一个多帖子批次。这一条优先尝试“${lens}”这个角度，但只在符合世界观时采用；也可以自行发明同样合理的新角度。
同一批次要主动发散：不要复用前面帖子相同的地点、人物关系、道具、冲突、开头句式或结论，不要只把同一件事换个标题。前面已生成的帖子如下：
${recent || "（还没有前置帖子）"}
世界书中的具体细节只是可选素材；除非它明确规定了时代、身份、技术/超自然规则或不可违反的禁忌，不要把它当作唯一话题。`;
};

const FORUM_CATEGORY_GUIDANCE: Record<string, string> = {
  情感: "恋爱、友情、家庭和亲密关系中的真实困惑或进展",
  八卦: "公开可讨论的见闻、后续、吃瓜线索和人物关系变化",
  吐槽: "生活、职场、校园或社交中让发帖人不爽但值得讨论的事情",
  求助: "发帖人正在面对、希望获得建议或经验的具体问题",
};

const correctionInstruction = `上一次候选不符合论坛公开内容规则。请重新生成一次：
只保留与公开帖子直接相关的自然论坛文字；移除动作旁白、情绪标签、伪媒体、私人姓名和无关故事。`;

const requireTextAiConfig = (settings: UserSettings): void => {
  if (!settings.apiKey?.trim() || !settings.selectedModel?.trim()) {
    throw new Error("论坛 AI 配置缺失：请先在 API 设置中填写 API Key 并选择文本模型。");
  }
};

const toAiRequest = (
  settings: UserSettings,
  prompt: { systemInstruction: string; message: string },
): ForumAiRequest => ({
  ...prompt,
  apiKey: settings.apiKey,
  model: settings.selectedModel,
  apiEndpoint: settings.apiEndpoint,
  apiTemperature: settings.apiTemperature,
  streamCompatible: settings.streamCompatible,
});

const generateValidatedCandidate = async <T>(input: {
  aiCall: ForumAiCall;
  request: ForumAiRequest;
  parse: (text: string) => T;
  validate: (candidate: T) => T | undefined;
}): Promise<T | undefined> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await input.aiCall({
      ...input.request,
      systemInstruction: attempt === 0
        ? input.request.systemInstruction
        : `${input.request.systemInstruction}\n\n${correctionInstruction}`,
    });
    try {
      const parsed = input.parse(result.text);
      const validated = input.validate(parsed);
      if (validated) return validated;
    } catch {
      // One corrected retry is allowed for parse and public-content validation failures.
    }
  }
  return undefined;
};

const getProtectedNames = (
  settings: UserSettings,
  characters: readonly Character[],
  ownerIdentityId: string,
): string[] => buildForumProtectedNames({
  ownerIdentity: settings.identities?.find((identity) => identity.id === ownerIdentityId),
  characters,
});

export const buildForumRelationGenerationContext = (input: {
  ownerIdentityId: string;
  relationship: CharacterRelationship;
  characters: readonly Character[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  worldBookEntries: readonly WorldBookEntry[];
  identities?: readonly UserIdentity[];
}): ForumRelationContext | undefined => {
  if (input.relationship.userIdentityId !== input.ownerIdentityId) return undefined;
  const canonicalId = resolveCanonicalCharacterId(input.relationship.characterId, input.characters);
  const character = input.characters.find((item) =>
    item.id === canonicalId && !item.isGroupChat && !item.isContactInstance);
  if (!character) return undefined;
  const worldBookEntries = input.worldBookEntries
    .filter((entry) =>
      entry.isActive !== false
      && isWorldBookEntryVisible(entry, { scenario: "public", characterId: canonicalId }))
    .slice(0, 8);
  const protectedNames = buildForumProtectedNames({
    ownerIdentity: input.identities?.find((identity) => identity.id === input.ownerIdentityId),
    characters: input.characters,
  });
  const promptContext = buildForumPublicSafeContext({
    character,
    // Relationship summaries are private and can never seed public topics.
    relationshipCompressedMemory: undefined,
    // Direct chat and relation Memory are private even when reduced to topic
    // labels; public generation must derive topics only from public inputs.
    recentMessages: [],
    memories: [],
    worldBookEntries,
    protectedNames,
  });
  return {
    relationship: input.relationship,
    character,
    promptContext,
    publicReplyPersona: `公开昵称：${character.remark || character.name}
${promptContext.split("\n")[0]}
回复时只能依据公开帖子，不得引用 relation 聊天、Memory 或关系事件。`,
  };
};

const anonymousAiAuthor = (): ForumPublicAuthor => ({
  displayName: "匿名用户",
  kind: "anonymous-ai",
  isAnonymous: true,
});

const relationAuthor = (
  context: ForumRelationContext,
  anonymous: boolean,
): ForumPublicAuthor => anonymous
  ? anonymousAiAuthor()
  : {
      displayName: context.character.remark || context.character.name,
      avatar: context.character.avatar || undefined,
      kind: "ai-character",
      isAnonymous: false,
    };

export const selectForumReplyAuthors = (input: {
  count: number;
  relationContexts: readonly ForumRelationContext[];
  communityNpcs?: readonly ForumCommunityNpc[];
  allowRelationshipAuthors?: boolean;
  random: () => number;
  seed: string;
}): ForumReplyAuthor[] => {
  const count = Math.max(0, Math.min(3, Math.floor(input.count)));
  if (count === 0) return [];
  const authors: ForumReplyAuthor[] = Array.from({ length: count }, (_, index) => ({
    kind: "virtual" as const,
    profile: getForumVirtualProfile(input.seed, index),
  }));
  const enabledCommunityNpcs = (input.communityNpcs || []).filter((npc) => npc.enabled);
  if (enabledCommunityNpcs.length > 0 && input.random() < 0.2) {
    const authorIndex = Math.min(count - 1, Math.floor(input.random() * count));
    const npc = enabledCommunityNpcs[Math.floor(input.random() * enabledCommunityNpcs.length)];
    authors[authorIndex] = {
      kind: "community-npc",
      npc,
      profile: toForumCommunityNpcProfile(npc),
      publicAuthor: toForumCommunityNpcAuthor(npc),
    };
  }
  const includeFriend = input.allowRelationshipAuthors !== false && input.relationContexts.length > 0
    && input.random() < FORUM_RELATION_REPLY_PROBABILITY;
  if (includeFriend) {
    const contextIndex = Math.min(
      input.relationContexts.length - 1,
      Math.floor(input.random() * input.relationContexts.length),
    );
    const authorIndex = Math.min(count - 1, Math.floor(input.random() * count));
    authors[authorIndex] = {
      kind: "relation",
      context: input.relationContexts[contextIndex],
    };
  }
  return authors;
};

const buildThreadPrompt = (input: {
  relationContext?: ForumRelationContext;
  virtualProfile: ForumVirtualProfile;
  communityNpc?: ForumCommunityNpc;
  categoryContext?: { name: string; worldview?: string };
  diversityHint?: string;
}): { systemInstruction: string; message: string } => ({
  systemInstruction: `你只负责提出一个虚拟本地论坛帖候选，不执行任何写操作。
${FORUM_PUBLIC_TEXT_RULES}
${FORUM_REALISM_RULES}
严格只输出一个 JSON 对象，不要 Markdown：
{"title":"1-80字","body":"30-800字","anonymous":false,"replies":[{"body":"5-120字的相关回复","replyToFloor":null}]}
replies 必须为 3-8 条，由普通论坛路人发表；每条都要直接回应主楼或此前已出现的真实回复。replyToFloor 只能引用本次候选中此前已出现的真实回复楼层；直接回复主楼必须为 null。
禁止输出 relationId、characterId、threadId、replyId、作者姓名或真实网络账号。`,
  message: `${FORUM_TOPIC_POOL_GUIDANCE}
可参考的发散方向：${FORUM_TOPIC_POOL}。
不要把类别名机械写进标题：
标题和正文要像不同真实论坛用户：长短、语气、标点和信息完整度可以不同，不要套用“求助：”模板。
${FORUM_REALISM_RULES}
${input.diversityHint || ""}
${input.categoryContext
    ? `当前帖子必须归入论坛分类“${input.categoryContext.name}”。${input.categoryContext.worldview
      ? `必须遵循以下分类世界观设定：
${input.categoryContext.worldview}
这段世界观是边界，不是话题池。把其中明确写出的时代、社会形态、人物身份、职业、技术/超自然上限与禁忌当作硬约束；没有明确规定的生活细节可以自然补全，但不能跳到古风、异世界、修仙等不相容设定。不要把内容局限为某一个角色的经历，不要反复复用世界书中的同一地点或道具，也不要强行提及分类名称。`
      : `主题、语气和事件应自然符合这个分类，不要把分类名机械写进标题。${FORUM_CATEGORY_GUIDANCE[input.categoryContext.name]
        ? `优先从这些方向取材：${FORUM_CATEGORY_GUIDANCE[input.categoryContext.name]}。`
        : "这是一个开放分类：只要不违背分类设定，就可以从多个公共生活领域发散，不要收缩成单一话题。"}`}`
    : ""}
${input.relationContext
    ? `以该角色的公开论坛表达方式生成一条帖子，可选择实名或匿名。
${input.relationContext.publicCognitiveContext
      ? formatPublicForumPostPromptContext(
        buildPublicForumPostPromptContext(input.relationContext.publicCognitiveContext),
      )
      : input.relationContext.promptContext}`
    : `以应用内虚拟论坛账号“${input.virtualProfile.displayName}”的风格生成一条帖子。
公开风格：${input.virtualProfile.publicStyle}
不得冒充任何已有角色，不读取聊天、Memory 或 WorldBook。`}`,
});

const isThreadCandidatePublicSafe = (input: {
  candidate: ForumGeneratedThreadCandidate;
  relationContext?: ForumRelationContext;
  virtualProfile: ForumVirtualProfile;
  communityNpc?: ForumCommunityNpc;
  protectedNames: readonly string[];
}): ForumGeneratedThreadCandidate | undefined => {
  if (!validateForumPostStyle({
    title: input.candidate.title,
    body: input.candidate.body,
  }).valid) return undefined;
  const anonymous = Boolean(input.relationContext && input.candidate.anonymous);
  const allowedAuthorNames = input.relationContext && !anonymous
    ? [
        input.relationContext.character.name,
        input.relationContext.character.remark || "",
      ]
    : input.relationContext
      ? []
      : [input.communityNpc?.displayName || input.virtualProfile.displayName];
  const violation = findForumPrivateNameViolation({
    text: `${input.candidate.title}\n${input.candidate.body}`,
    protectedNames: input.protectedNames,
    allowedAuthorNames,
  });
  if (violation) return undefined;
  const replies = (input.candidate.replies || []).filter((reply) => {
    if (!validateForumReplyStyle(reply.body).valid) return false;
    if (findForumPrivateNameViolation({
      text: reply.body,
      protectedNames: input.protectedNames,
      publicTexts: [input.candidate.title, input.candidate.body],
    })) return false;
    return isForumGeneratedReplyRelevant({
      replyBody: reply.body,
      threadTitle: input.candidate.title,
      threadBody: input.candidate.body,
    });
  });
  return { ...input.candidate, replies };
};

const resolveReplyTarget = (
  replyToFloor: number | null | undefined,
  threadId: string,
  availableReplies: readonly ForumReply[],
): { valid: boolean; target?: ForumReply } => {
  if (replyToFloor === null || replyToFloor === undefined) return { valid: true };
  if (!Number.isInteger(replyToFloor) || replyToFloor < 2) return { valid: false };
  const target = availableReplies.find((reply) =>
    reply.threadId === threadId
    && reply.floor === replyToFloor
    && !reply.isDeleted);
  return target ? { valid: true, target } : { valid: false };
};

const quoteTargetFields = (target?: ForumReply) => target ? {
  replyToReplyId: target.id,
  replyToFloor: target.floor,
  replyToAuthorName: target.publicAuthor.displayName,
  quotedText: target.isDeleted ? "该回复已删除" : target.body.slice(0, 120),
} : {};

const createGeneratedThread = (input: {
  ownerIdentityId: string;
  relationContext?: ForumRelationContext;
  virtualProfile: ForumVirtualProfile;
  communityNpc?: ForumCommunityNpc;
  category?: string;
  isStoryPost: boolean;
  candidate: ForumGeneratedThreadCandidate;
  occurredAt: number;
  now: number;
}): { thread: ForumThread; replies: ForumReply[] } => {
  const character = input.relationContext?.character;
  const anonymous = Boolean(character && input.candidate.anonymous);
  const publicAuthor = input.relationContext
    ? relationAuthor(input.relationContext, anonymous)
    : input.communityNpc
      ? toForumCommunityNpcAuthor(input.communityNpc)
      : createForumVirtualAuthor(input.virtualProfile);
  const source = character
    ? anonymous ? "ai-character-anonymous" : "ai-character"
    : "ai-virtual";
  const inferredStoryArc = inferForumStoryArc({
    source,
    title: input.candidate.title,
    body: input.candidate.body,
  });
  const threadId = id("forum-ai-thread");
  const storyArc = input.isStoryPost
    ? inferredStoryArc || {
        category: "other" as const,
        status: "open" as const,
        episode: 1,
        continuationProbability: 0.55,
        publicRecap: input.candidate.body.slice(0, 300),
      }
    : undefined;
  const thread: ForumThread = {
    id: threadId,
    ownerIdentityId: input.ownerIdentityId,
    publicAuthor,
    ...(character ? {
      privateAuthorRelationId: input.relationContext?.relationship.id,
      privateAuthorCharacterId: character.id,
    } : {}),
    title: input.candidate.title,
    body: input.candidate.body,
    ...(input.category ? { category: input.category } : {}),
    source,
    occurredAt: Math.min(input.now, input.occurredAt),
    baseLikeCount: getForumBaselineLikeCount(threadId, source),
    likedByIdentityIds: [],
    replyCount: 0,
    createdAt: input.now,
    updatedAt: input.now,
    lastActivityAt: input.now,
    ...(storyArc ? { storyArc } : {}),
  };
  const replies: ForumReply[] = [];
  for (const [candidateIndex, candidate] of (input.candidate.replies || []).entries()) {
    const targetResult = resolveReplyTarget(candidate.replyToFloor, threadId, replies);
    if (!targetResult.valid) continue;
    const floor = replies.length + 2;
    const profile = getForumVirtualProfile(threadId, candidateIndex);
    replies.push({
      id: id("forum-ai-reply"),
      threadId,
      ownerIdentityId: input.ownerIdentityId,
      floor,
      kind: "reply",
      publicAuthor: createForumVirtualAuthor(profile),
      body: candidate.body,
      ...quoteTargetFields(targetResult.target),
      source: "ai-virtual",
      occurredAt: Math.min(input.now, thread.occurredAt + (replies.length + 1) * 1000),
      baseLikeCount: 0,
      likedByIdentityIds: [],
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
  thread.replyCount = replies.length;
  return { thread, replies };
};

export const mapForumGenerationError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/401|403|unauthorized|forbidden|api key.*invalid|认证/i.test(message)) return "论坛生成认证失败：请检查文本 API Key 或模型权限。";
  if (/429|rate|限流|too many/i.test(message)) return "论坛生成请求过于频繁，请稍后重试。";
  if (/结构解析|json/i.test(message)) return "论坛生成结果结构解析失败，请重试。";
  if (/生成内容无效|无效/i.test(message)) return "AI 返回的论坛内容无效，未写入任何帖子。";
  if (/配置缺失/i.test(message)) return message;
  return "论坛生成网络异常，请稍后重试。";
};

export async function generateForumThreads(input: {
  ownerIdentityId: string;
  count: number;
  trigger: "refresh" | "lazy";
  relationships: readonly CharacterRelationship[];
  characters: readonly Character[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  worldBookEntries: readonly WorldBookEntry[];
  existingThreads: readonly ForumThread[];
  settings: UserSettings;
  now: number;
  random?: () => number;
  /** Forum-only virtual identities. They are never real Characters or Relationships. */
  communityNpcs?: readonly ForumCommunityNpc[];
  aiCall?: ForumAiCall;
  preferredRelationId?: string;
  /** Explicitly classified public candidates only; omitted records remain denied. */
  publicEventCandidates?: readonly PublicCharacterEventCandidate[];
  /** Explicitly classified public world knowledge only; omitted records remain denied. */
  publicWorldSettings?: readonly PublicWorldSettingCandidate[];
  /** Optional user-created category worldview used to constrain generated public posts. */
  categoryContext?: { name: string; worldview?: string };
  /** Optional category rotation used by the recommendation feed. */
  categoryTargets?: readonly { name: string; worldview?: string }[];
}): Promise<ForumGenerationBundle> {
  requireTextAiConfig(input.settings);
  const random = input.random || Math.random;
  const diversityBatchOffset = Math.floor(random() * FORUM_DIVERSITY_LENSES.length);
  const relationContexts = input.relationships
    .filter((relation) =>
      relation.userIdentityId === input.ownerIdentityId
      && (!input.preferredRelationId || relation.id === input.preferredRelationId))
    .map((relationship) => buildForumRelationGenerationContext({
      ...input,
      relationship,
      identities: input.settings.identities,
    }))
    .filter((value): value is ForumRelationContext => Boolean(value))
    .map((context) => ({
      ...context,
      publicCognitiveContext: buildPublicForumCognitiveContext({
        character: context.character,
        events: (input.publicEventCandidates || [])
          .filter((candidate) => candidate.event.characterId === context.character.id),
        worldSettings: input.publicWorldSettings || [],
        currentTime: { now: input.now },
      }),
    }));
  const protectedNames = getProtectedNames(
    input.settings,
    input.characters,
    input.ownerIdentityId,
  );
  const planned = Math.max(1, Math.min(8, Math.floor(input.count)));
  const storySlotOffset = random() < FORUM_STORY_POST_RATIO ? 0 : 1;
  const threads: ForumThread[] = [];
  const replies: ForumReply[] = [];
  const fingerprints = new Set<string>();
  const aiCall = input.aiCall || defaultAiCall;
  // Invalid or duplicate candidates must not silently reduce a requested
  // 4–8-post refresh. Allow a bounded second pass while keeping the hard
  // upper bound at the requested count.
  for (let attempt = 0; attempt < planned * 2 && threads.length < planned; attempt += 1) {
    const index = threads.length;
    const categoryContext = input.categoryTargets?.length
      ? input.categoryTargets[index % input.categoryTargets.length]
      : input.categoryContext;
    const relationCandidates = relationContexts.filter((context) => canUseRelationshipThreadAuthor({
      relationId: context.relationship.id,
      threads: [...input.existingThreads, ...threads],
      now: input.now,
      policy: DEFAULT_FORUM_POST_AUTHOR_POLICY,
    }));
    const chosenKind = chooseForumThreadAuthorKind({
      relationAvailable: relationContexts.length > 0,
      relationshipAllowed: relationCandidates.length > 0,
      random,
      policy: DEFAULT_FORUM_POST_AUTHOR_POLICY,
    });
    const relationContext = chosenKind === "relationship"
      ? relationCandidates[index % relationCandidates.length]
      : undefined;
    const enabledCommunityNpcs = (input.communityNpcs || []).filter((npc) => npc.enabled);
    const communityNpc = !relationContext && enabledCommunityNpcs.length > 0 && random() < 0.2
      ? enabledCommunityNpcs[Math.min(enabledCommunityNpcs.length - 1, Math.floor(random() * enabledCommunityNpcs.length))]
      : undefined;
    const virtualProfile = communityNpc
      ? toForumCommunityNpcProfile(communityNpc)
      : getForumVirtualProfile(
      `${input.ownerIdentityId}:${input.trigger}:${input.now}`,
      index,
    );
    const prompt = buildThreadPrompt({
      relationContext,
      virtualProfile,
      communityNpc,
      categoryContext,
      diversityHint: buildForumDiversityHint({
        batchIndex: index,
        attempt,
        batchOffset: diversityBatchOffset,
        recentThreads: threads,
      }),
    });
    const rawCandidate = await generateValidatedCandidate({
      aiCall,
      request: toAiRequest(input.settings, prompt),
      parse: parseForumThreadCandidate,
      validate: (value) => isThreadCandidatePublicSafe({
        candidate: value,
        relationContext,
        virtualProfile,
        communityNpc,
        protectedNames,
      }),
    });
    if (!rawCandidate) continue;
    const candidate = relationContext
      ? { ...rawCandidate, anonymous: random() < DEFAULT_FORUM_POST_AUTHOR_POLICY.anonymousRelationshipProbability }
      : rawCandidate;
    if (!isThreadCandidatePublicSafe({ candidate, relationContext, virtualProfile, communityNpc, protectedNames })) continue;
    const occurredAt = Math.min(input.now, input.now - (planned - index - 1) * 61_000);
    const generated = createGeneratedThread({
      ownerIdentityId: input.ownerIdentityId,
      relationContext,
      virtualProfile,
      communityNpc,
      category: categoryContext?.name,
      isStoryPost: (index + storySlotOffset) % 2 === 0,
      candidate,
      occurredAt,
      now: input.now,
    });
    if (generated.replies.length < FORUM_INITIAL_REPLY_MIN
      || generated.replies.length > FORUM_INITIAL_REPLY_MAX) {
      continue;
    }
    const fingerprint = forumThreadFingerprint({
      ownerIdentityId: input.ownerIdentityId,
      title: generated.thread.title,
      body: generated.thread.body,
      authorScope: relationContext?.relationship.id || virtualProfile.id,
      trigger: input.trigger,
    });
    if (fingerprints.has(fingerprint)
      || isForumThreadDuplicate(generated.thread, [...input.existingThreads, ...threads])
      || !validateForumReplyTimeline(generated.thread, generated.replies)) {
      continue;
    }
    fingerprints.add(fingerprint);
    threads.push(generated.thread);
    replies.push(...generated.replies);
  }
  return { threads, replies, fingerprints: [...fingerprints] };
}

const publicThreadContext = (
  thread: ForumThread,
  replies: readonly ForumReply[],
): string => {
  const publicReplies = replies
    .filter((reply) => reply.threadId === thread.id && !reply.isDeleted)
    .sort((left, right) => left.floor - right.floor)
    .slice(-12)
    .map((reply) => `${reply.floor} 楼 ${reply.publicAuthor.displayName}：${trimContext(reply.body, 240)}`)
    .join("\n");
  const validFloors = replies
    .filter((reply) => reply.threadId === thread.id && !reply.isDeleted)
    .map((reply) => reply.floor)
    .sort((left, right) => left - right);
  const continuation = thread.storyArc?.status === "open" && thread.storyArc.publicRecap
    ? `\n当前公开连载摘要（只可作为已发生事实，不能扩写成新背景）：${trimContext(thread.storyArc.publicRecap, 300)}`
    : "";
  return `公开作者：${thread.publicAuthor.displayName}
标题：${thread.title}
正文：${thread.body}
${continuation}
已有公开楼层：
${publicReplies || "无"}
可引用楼层：${validFloors.length > 0 ? validFloors.join("、") : "无"}。直接回复主楼时 replyToFloor 必须为 null。`;
};

const validateReplyCandidate = (input: {
  candidate: ForumGeneratedReplyCandidate;
  thread: ForumThread;
  availableReplies: readonly ForumReply[];
  protectedNames: readonly string[];
  author: ForumReplyAuthor | { kind: "thread-author"; publicAuthor: ForumPublicAuthor };
}): ForumGeneratedReplyCandidate | undefined => {
  if (!validateForumReplyStyle(input.candidate.body).valid) return undefined;
  const targetResult = resolveReplyTarget(
    input.candidate.replyToFloor,
    input.thread.id,
    input.availableReplies,
  );
  if (!targetResult.valid) return undefined;
  const allowedAuthorNames = input.author.kind === "relation"
    ? input.candidate.anonymous
      ? []
      : [
          input.author.context.character.name,
          input.author.context.character.remark || "",
        ]
    : input.author.kind === "virtual"
      ? [input.author.profile.displayName]
      : input.author.kind === "community-npc"
        ? [input.author.npc.displayName]
      : input.author.publicAuthor.isAnonymous
        ? []
        : [input.author.publicAuthor.displayName];
  if (findForumPrivateNameViolation({
    text: input.candidate.body,
    protectedNames: input.protectedNames,
    publicTexts: [
      input.thread.title,
      input.thread.body,
      ...input.availableReplies
        .filter((reply) => reply.threadId === input.thread.id && !reply.isDeleted)
        .map((reply) => reply.body),
    ],
    allowedAuthorNames,
  })) return undefined;
  if (!isForumGeneratedReplyRelevant({
    replyBody: input.candidate.body,
    threadTitle: input.thread.title,
    threadBody: input.thread.body,
    targetBody: targetResult.target?.body,
  })) return undefined;
  return input.candidate;
};

const createGeneratedReply = (input: {
  prefix: string;
  thread: ForumThread;
  candidate: ForumGeneratedReplyCandidate;
  author: ForumReplyAuthor;
  availableReplies: readonly ForumReply[];
  floor: number;
  occurredAt: number;
  now: number;
}): ForumReply | undefined => {
  const targetResult = resolveReplyTarget(
    input.candidate.replyToFloor,
    input.thread.id,
    input.availableReplies,
  );
  if (!targetResult.valid) return undefined;
  const anonymous = input.author.kind === "relation" && Boolean(input.candidate.anonymous);
  return {
    id: id(input.prefix),
    threadId: input.thread.id,
    ownerIdentityId: input.thread.ownerIdentityId,
    floor: input.floor,
    kind: "reply",
    publicAuthor: input.author.kind === "relation"
      ? relationAuthor(input.author.context, anonymous)
      : input.author.kind === "community-npc"
        ? toForumCommunityNpcAuthor(input.author.npc)
        : createForumVirtualAuthor(input.author.profile),
    body: input.candidate.body,
    ...quoteTargetFields(targetResult.target),
    source: input.author.kind === "relation"
      ? anonymous ? "ai-character-anonymous" : "ai-character"
      : "ai-virtual",
    occurredAt: Math.min(input.now, Math.max(input.thread.occurredAt, input.occurredAt)),
    baseLikeCount: 0,
    likedByIdentityIds: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
};

const buildReplyPrompt = (input: {
  thread: ForumThread;
  availableReplies: readonly ForumReply[];
  author: ForumReplyAuthor;
  promptKind?: "reply" | "activity";
}): { systemInstruction: string; message: string } => ({
  systemInstruction: `你只生成一条与当前论坛帖直接相关的公开回复。
${FORUM_PUBLIC_TEXT_RULES}
${FORUM_REPLY_REALISM_RULES}
严格输出 JSON：{"body":"回复正文","anonymous":false,"replyToFloor":null}。
replyToFloor 只能取提示中列出的真实楼层；直接回复主楼必须为 null。
不输出任何 ID、作者名、引用正文或内部身份。`,
  message: `${publicThreadContext(input.thread, input.availableReplies)}
${input.promptKind === "activity"
    ? "当前是动态楼层：优先回应最近一条公开楼层，允许追问、质疑、补充或开玩笑；不要把它写成完整剧情。\n"
    : "这是帖子刚发布后的首批回复：先对主楼的具体细节作出自然反应，不要轮流复述主楼。\n"}
${input.author.kind === "relation"
    ? `按该角色经过公开脱敏的说话风格回复：
${input.author.context.publicCognitiveContext
      ? input.promptKind === "activity"
        ? formatPublicForumActivityPromptContext(
          buildPublicForumActivityPromptContext(input.author.context.publicCognitiveContext),
        )
        : formatPublicForumReplyPromptContext(
          buildPublicForumReplyPromptContext(input.author.context.publicCognitiveContext),
        )
      : input.author.context.publicReplyPersona}`
    : `作为普通论坛用户“${input.author.profile.displayName}”回复。
公开风格：${input.author.profile.publicStyle}
不得读取或猜测任何角色聊天、Memory、WorldBook。`}`,
});

export async function generateInitialRepliesForUserThread(input: {
  thread: ForumThread;
  existingReplies: readonly ForumReply[];
  relationships: readonly CharacterRelationship[];
  characters: readonly Character[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  worldBookEntries: readonly WorldBookEntry[];
  settings: UserSettings;
  now: number;
  maxReplies?: number;
  random?: () => number;
  communityNpcs?: readonly ForumCommunityNpc[];
  aiCall?: ForumAiCall;
  /** Explicit public candidates only; absence is denied by the public context policy. */
  publicEventCandidates?: readonly PublicCharacterEventCandidate[];
  /** Explicit public world knowledge only; absence is denied by the public context policy. */
  publicWorldSettings?: readonly PublicWorldSettingCandidate[];
}): Promise<ForumReply[]> {
  requireTextAiConfig(input.settings);
  const random = input.random || Math.random;
  const relationContexts = input.relationships
    .filter((relation) => relation.userIdentityId === input.thread.ownerIdentityId)
    .map((relationship) => buildForumRelationGenerationContext({
      ownerIdentityId: input.thread.ownerIdentityId,
      relationship,
      characters: input.characters,
      messages: input.messages,
      memories: input.memories,
      worldBookEntries: input.worldBookEntries,
      identities: input.settings.identities,
    }))
    .filter((value): value is ForumRelationContext => Boolean(value))
    .map((context) => ({
      ...context,
      publicCognitiveContext: buildPublicForumCognitiveContext({
        character: context.character,
        events: (input.publicEventCandidates || [])
          .filter((candidate) => candidate.event.characterId === context.character.id),
        worldSettings: input.publicWorldSettings || [],
        currentTime: { now: input.now },
      }),
    }));
  const replyCount = Math.max(1, Math.min(8, input.maxReplies ?? 8));
  const authors = selectForumReplyAuthors({
    count: replyCount,
    relationContexts,
    communityNpcs: input.communityNpcs,
    allowRelationshipAuthors: input.thread.source !== "user-anonymous",
    random,
    seed: `${input.thread.id}:initial`,
  });
  const protectedNames = getProtectedNames(
    input.settings,
    input.characters,
    input.thread.ownerIdentityId,
  );
  const aiCall = input.aiCall || defaultAiCall;
  const generated: ForumReply[] = [];
  for (const [index, author] of authors.entries()) {
    const availableReplies = [
      ...input.existingReplies.filter((reply) => reply.threadId === input.thread.id),
      ...generated,
    ];
    const prompt = buildReplyPrompt({ thread: input.thread, availableReplies, author });
    const candidate = await generateValidatedCandidate({
      aiCall,
      request: toAiRequest(input.settings, prompt),
      parse: parseForumReplyCandidate,
      validate: (value) => validateReplyCandidate({
        candidate: value,
        thread: input.thread,
        availableReplies,
        protectedNames,
        author,
      }),
    });
    if (!candidate) continue;
    if (availableReplies.some((reply) =>
      reply.threadId === input.thread.id && reply.body.trim() === candidate.body.trim())) continue;
    const floor = Math.max(1, ...availableReplies.map((reply) => reply.floor)) + 1;
    const reply = createGeneratedReply({
      prefix: "forum-ai-reply",
      thread: input.thread,
      candidate,
      author,
      availableReplies,
      floor,
      occurredAt: input.thread.occurredAt + (index + 1) * 1000,
      now: input.now,
    });
    if (reply) generated.push(reply);
  }
  return generated.filter((reply) => reply.occurredAt >= input.thread.occurredAt);
}

export interface ForumThreadActivityResult {
  outcome: "no-update" | "author-update" | "replies";
  replies: ForumReply[];
}

const isAiOrVirtualThread = (thread: ForumThread): boolean =>
  thread.source === "ai-character"
  || thread.source === "ai-character-anonymous"
  || thread.source === "ai-virtual"
  || thread.source === "virtual";

export async function generateThreadActivity(input: {
  trigger: "like-engagement" | "manual-thread-refresh";
  ownerIdentityId: string;
  thread: ForumThread;
  existingReplies: readonly ForumReply[];
  relationships: readonly CharacterRelationship[];
  characters: readonly Character[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  worldBookEntries: readonly WorldBookEntry[];
  settings: UserSettings;
  now: number;
  random?: () => number;
  aiCall?: ForumAiCall;
  /** Explicit public candidates only; absence is denied by the public context policy. */
  publicEventCandidates?: readonly PublicCharacterEventCandidate[];
  /** Explicit public world knowledge only; absence is denied by the public context policy. */
  publicWorldSettings?: readonly PublicWorldSettingCandidate[];
}): Promise<ForumThreadActivityResult> {
  if (input.thread.ownerIdentityId !== input.ownerIdentityId) {
    throw new Error("生成内容无效：帖子不属于当前身份。");
  }
  const random = input.random || Math.random;
  const probability = input.trigger === "like-engagement"
    ? FORUM_LIKE_ENGAGEMENT_PROBABILITY
    : FORUM_MANUAL_REFRESH_PROBABILITY;
  if (!shouldGenerateForumActivity(random, probability)) {
    return { outcome: "no-update", replies: [] };
  }
  requireTextAiConfig(input.settings);
  const validContexts = input.relationships
    .filter((relationship) => relationship.userIdentityId === input.ownerIdentityId)
    .map((relationship) => buildForumRelationGenerationContext({
      ownerIdentityId: input.ownerIdentityId,
      relationship,
      characters: input.characters,
      messages: input.messages,
      memories: input.memories,
      worldBookEntries: input.worldBookEntries,
      identities: input.settings.identities,
    }))
    .filter((value): value is ForumRelationContext => Boolean(value))
    .map((context) => ({
      ...context,
      publicCognitiveContext: buildPublicForumCognitiveContext({
        character: context.character,
        events: (input.publicEventCandidates || [])
          .filter((candidate) => candidate.event.characterId === context.character.id),
        worldSettings: input.publicWorldSettings || [],
        currentTime: { now: input.now },
      }),
    }));
  const originalAuthorContext = input.thread.privateAuthorRelationId
    ? validContexts.find((context) =>
        context.relationship.id === input.thread.privateAuthorRelationId
        && (!input.thread.privateAuthorCharacterId
          || context.character.id === input.thread.privateAuthorCharacterId))
    : undefined;
  const canAuthorUpdate = isAiOrVirtualThread(input.thread)
    && (input.thread.source === "ai-virtual"
      || input.thread.source === "virtual"
      || Boolean(originalAuthorContext));
  const chooseAuthorUpdate = canAuthorUpdate && random() < FORUM_AUTHOR_UPDATE_PROBABILITY;
  const aiCall = input.aiCall || defaultAiCall;
  const threadReplies = input.existingReplies
    .filter((reply) => reply.threadId === input.thread.id)
    .sort((left, right) => left.floor - right.floor);
  const baseFloor = Math.max(1, ...threadReplies.map((reply) => reply.floor));
  const protectedNames = getProtectedNames(
    input.settings,
    input.characters,
    input.ownerIdentityId,
  );

  if (chooseAuthorUpdate) {
    const threadAuthor = {
      kind: "thread-author" as const,
      publicAuthor: input.thread.publicAuthor,
    };
    const prompt = {
      systemInstruction: `你只生成一条论坛楼主后续更新。
${FORUM_PUBLIC_TEXT_RULES}
${FORUM_REPLY_REALISM_RULES}
严格输出 JSON：{"body":"更新正文","replyToFloor":null}。
不修改原主楼，不输出任何 ID；仅在确实针对某楼补充时选择提示中的真实楼层。
这是一条楼主动态，不是新章节：必须提供一个此前没有的公开事实、结果、纠正或改变后的打算；可以回应某一楼的建议，但不要重述全文或凭空补全幕后剧情。`,
      message: `${publicThreadContext(input.thread, threadReplies)}
请以原楼主的公开身份追加自然后续更新。只从当前公开内容和楼层中推进，允许因评论改变原来的判断或计划。
${originalAuthorContext
    ? `${originalAuthorContext.promptContext}\n${formatPublicForumActivityPromptContext(
      buildPublicForumActivityPromptContext(originalAuthorContext.publicCognitiveContext!),
    )}`
    : "该帖来自应用内虚拟论坛账号，不读取任何角色私密上下文。"}`,
    };
    const candidate = await generateValidatedCandidate({
      aiCall,
      request: toAiRequest(input.settings, prompt),
      parse: parseForumReplyCandidate,
      validate: (value) => validateReplyCandidate({
        candidate: value,
        thread: input.thread,
        availableReplies: threadReplies,
        protectedNames,
        author: threadAuthor,
      }),
    });
    if (!candidate || threadReplies.some((reply) => reply.body.trim() === candidate.body.trim())) {
      return { outcome: "no-update", replies: [] };
    }
    const targetResult = resolveReplyTarget(candidate.replyToFloor, input.thread.id, threadReplies);
    if (!targetResult.valid) return { outcome: "no-update", replies: [] };
    const reply: ForumReply = {
      id: id("forum-author-update"),
      threadId: input.thread.id,
      ownerIdentityId: input.ownerIdentityId,
      floor: baseFloor + 1,
      kind: "author-update",
      publicAuthor: { ...input.thread.publicAuthor },
      body: candidate.body,
      ...quoteTargetFields(targetResult.target),
      source: input.thread.source === "ai-character-anonymous"
        ? "ai-character-anonymous"
        : input.thread.source === "ai-character"
          ? "ai-character"
          : "ai-virtual",
      occurredAt: Math.min(input.now, Math.max(input.thread.occurredAt, input.now)),
      baseLikeCount: 0,
      likedByIdentityIds: [],
      createdAt: input.now,
      updatedAt: input.now,
    };
    return { outcome: "author-update", replies: [reply] };
  }

  const requestedCount = 1 + Math.floor(random() * 3);
  const authors = selectForumReplyAuthors({
    count: requestedCount,
    relationContexts: validContexts,
    random,
    seed: `${input.thread.id}:${input.trigger}:${baseFloor}`,
  });
  const generated: ForumReply[] = [];
  for (const [index, author] of authors.entries()) {
    const availableReplies = [...threadReplies, ...generated];
    const prompt = buildReplyPrompt({
      thread: input.thread,
      availableReplies,
      author,
      promptKind: "activity",
    });
    const candidate = await generateValidatedCandidate({
      aiCall,
      request: toAiRequest(input.settings, prompt),
      parse: parseForumReplyCandidate,
      validate: (value) => validateReplyCandidate({
        candidate: value,
        thread: input.thread,
        availableReplies,
        protectedNames,
        author,
      }),
    });
    if (!candidate || availableReplies.some((reply) =>
      reply.body.trim() === candidate.body.trim())) continue;
    const floor = baseFloor + generated.length + 1;
    const reply = createGeneratedReply({
      prefix: "forum-activity-reply",
      thread: input.thread,
      candidate,
      author,
      availableReplies,
      floor,
      occurredAt: input.now - Math.max(0, authors.length - index - 1) * 1000,
      now: input.now,
    });
    if (reply) generated.push(reply);
  }
  return generated.length > 0
    ? { outcome: "replies", replies: generated }
    : { outcome: "no-update", replies: [] };
}
