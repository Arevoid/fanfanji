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

const defaultAiCall: ForumAiCall = (params) => apiChat({ ...params, ...PromptComposer.compose({ scenario: "forum-thread", message: params.message, history: [], systemInstruction: params.systemInstruction }) });

const id = (prefix: string): string => createApplicationId(prefix);

const trimContext = (value: string, max = 1800): string =>
  value.trim().slice(0, max);

const FORUM_PUBLIC_TEXT_RULES = `论坛内容只能是普通纯文本。
禁止括号动作、神态、心理描写和角色扮演旁白；禁止[无语]等状态标签。
禁止伪造表情包、图片、语音、视频、附件、Markdown 图片、data URL、聊天分段或时间标记。
不得声称执行点赞、发布、转发、删除、发送媒体等操作。
不得公开输入中未在帖子或公开楼层出现的私人姓名、昵称、身份或可识别细节。
回复必须直接回应主楼主题或指定楼层，不得拼接无关私人故事。`;

const FORUM_TOPIC_POOL = "情感、恋爱求助、友情与家庭、校园/宿舍/社团、职场、日常求助、分享安利、捞人偶遇、吐槽、奇怪经历、都市怪谈、微恐悬疑、规则怪谈、幻想种族、宠物邻里、网络社交、树洞、连载故事、事情后续与吃瓜讨论";

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
}): { systemInstruction: string; message: string } => ({
  systemInstruction: `你只负责提出一个虚拟本地论坛帖候选，不执行任何写操作。
${FORUM_PUBLIC_TEXT_RULES}
严格只输出一个 JSON 对象，不要 Markdown：
{"title":"1-80字","body":"1-5000字","anonymous":false,"replies":[{"body":"相关回复","replyToFloor":null}]}
replies 为 0-5 条，由普通论坛路人发表。replyToFloor 只能引用本次候选中此前已出现的真实回复楼层；直接回复主楼必须为 null。
禁止输出 relationId、characterId、threadId、replyId、作者姓名或真实网络账号。`,
  message: `从以下话题池自然选一个，不要把类别名机械写进标题：${FORUM_TOPIC_POOL}。
标题和正文要像不同真实论坛用户：长短、语气、标点和信息完整度可以不同，不要套用“求助：”模板。
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
  const threadId = id("forum-ai-thread");
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
    source: character
      ? anonymous ? "ai-character-anonymous" : "ai-character"
      : "ai-virtual",
    occurredAt: Math.min(input.now, input.occurredAt),
    baseLikeCount: getForumBaselineLikeCount(threadId, character
      ? anonymous ? "ai-character-anonymous" : "ai-character"
      : "ai-virtual"),
    likedByIdentityIds: [],
    replyCount: 0,
    createdAt: input.now,
    updatedAt: input.now,
    lastActivityAt: input.now,
    ...(inferForumStoryArc({ source: character
      ? anonymous ? "ai-character-anonymous" : "ai-character"
      : "ai-virtual", title: input.candidate.title, body: input.candidate.body })
      ? { storyArc: inferForumStoryArc({ source: character
        ? anonymous ? "ai-character-anonymous" : "ai-character"
        : "ai-virtual", title: input.candidate.title, body: input.candidate.body }) }
      : {}),
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
}): Promise<ForumGenerationBundle> {
  requireTextAiConfig(input.settings);
  const random = input.random || Math.random;
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
  const planned = Math.max(1, Math.min(5, Math.floor(input.count)));
  const threads: ForumThread[] = [];
  const replies: ForumReply[] = [];
  const fingerprints = new Set<string>();
  const aiCall = input.aiCall || defaultAiCall;
  for (let index = 0; index < planned; index += 1) {
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
    const prompt = buildThreadPrompt({ relationContext, virtualProfile, communityNpc });
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
      candidate,
      occurredAt,
      now: input.now,
    });
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
  return `公开作者：${thread.publicAuthor.displayName}
标题：${thread.title}
正文：${thread.body}
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
严格输出 JSON：{"body":"回复正文","anonymous":false,"replyToFloor":null}。
replyToFloor 只能取提示中列出的真实楼层；直接回复主楼必须为 null。
不输出任何 ID、作者名、引用正文或内部身份。`,
  message: `${publicThreadContext(input.thread, input.availableReplies)}
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
严格输出 JSON：{"body":"更新正文","replyToFloor":null}。
不修改原主楼，不输出任何 ID；仅在确实针对某楼补充时选择提示中的真实楼层。`,
      message: `${publicThreadContext(input.thread, threadReplies)}
请以原楼主的公开身份追加自然后续更新。
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
