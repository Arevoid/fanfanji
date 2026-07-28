import type {
  Character,
  ForumPublicAuthor,
  ForumReply,
  ForumThread,
  MemoryItem,
  Message,
  UserSettings,
  WorldBookEntry,
} from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../../../domain/character/characterIdentity";
import { apiChat } from "../../../utils/apiHelper";
import {
  forumThreadFingerprint,
  isForumThreadDuplicate,
  parseForumReplyCandidate,
  parseForumThreadCandidate,
  validateForumReplyTimeline,
} from "../../../domain/forum/forumValidation";
import {
  FORUM_LIKE_ENGAGEMENT_PROBABILITY,
  FORUM_MANUAL_REFRESH_PROBABILITY,
  shouldGenerateForumActivity,
} from "../../../domain/forum/forumGenerationGuard";

export interface ForumRelationContext {
  relationship: CharacterRelationship;
  character: Character;
  promptContext: string;
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

const defaultAiCall: ForumAiCall = (params) => apiChat({ ...params, history: [] });

const id = (prefix: string): string => {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
};

const trimContext = (value: string, max = 1800): string =>
  value.trim().slice(0, max);

export const buildForumRelationGenerationContext = (input: {
  ownerIdentityId: string;
  relationship: CharacterRelationship;
  characters: readonly Character[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  worldBookEntries: readonly WorldBookEntry[];
}): ForumRelationContext | undefined => {
  if (input.relationship.userIdentityId !== input.ownerIdentityId) return undefined;
  const canonicalId = resolveCanonicalCharacterId(input.relationship.characterId, input.characters);
  const character = input.characters.find((item) =>
    item.id === canonicalId && !item.isGroupChat && !item.isContactInstance);
  if (!character) return undefined;
  const recentMessages = input.messages
    .filter((message) =>
      message.relationId === input.relationship.id
      && message.conversationId === input.relationship.conversationId)
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-16)
    .map((message) => `${message.sender === "user" ? "用户" : character.name}：${trimContext(message.content, 240)}`)
    .join("\n");
  const relationMemories = input.memories
    .filter((memory) => memory.relationId === input.relationship.id)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 8)
    .map((memory) => `- ${trimContext(memory.content, 240)}`)
    .join("\n");
  const worldBook = input.worldBookEntries
    .filter((entry) =>
      entry.isActive !== false
      && (entry.characterId === canonicalId || entry.characterId === "global"))
    .slice(0, 8)
    .map((entry) => `- ${entry.title}：${trimContext(entry.content, 300)}`)
    .join("\n");
  return {
    relationship: input.relationship,
    character,
    promptContext: `角色：${character.name}
人设：${trimContext(`${character.personality}\n${character.backstory}`, 1600)}
当前关系压缩记忆：${trimContext(input.relationship.compressedMemory || "", 900) || "无"}
当前 relation 的近期聊天：
${recentMessages || "无"}
当前 relation 的 Memory：
${relationMemories || "无"}
角色 WorldBook：
${worldBook || "无"}`,
  };
};

const virtualAuthor = (name?: string): ForumPublicAuthor => ({
  displayName: name?.trim().slice(0, 24) || "路过的论坛用户",
  kind: "virtual",
  isAnonymous: false,
});

const anonymousAiAuthor = (): ForumPublicAuthor => ({
  displayName: "匿名用户",
  kind: "anonymous-ai",
  isAnonymous: true,
});

const buildThreadPrompt = (input: {
  relationContext?: ForumRelationContext;
  trigger: "refresh" | "lazy";
}): { systemInstruction: string; message: string } => ({
  systemInstruction: `你只负责提出一个虚拟本地论坛帖候选，不执行发布、点赞、删除或转发。
严格只输出一个 JSON 对象，不要 Markdown：
{"title":"1-80字","body":"1-5000字","anonymous":false,"virtualDisplayName":"虚构昵称","replies":[{"body":"相关回复","displayName":"虚构昵称","anonymous":false,"replyToFloor":2}]}
replies 为 0-5 条。replyToFloor 只能引用此前已经存在的楼层；不确定时省略。禁止输出 relationId、characterId、threadId 或真实网络账号。`,
  message: input.relationContext
    ? `以这个角色在当前独立关系中的视角，生成一条自然论坛帖。角色可选择实名或匿名。\n${input.relationContext.promptContext}`
    : "生成一条来自应用内虚拟论坛账号的自然帖子。不得冒充已存在角色，也不得涉及真实论坛用户。",
});

const createGeneratedThread = (input: {
  ownerIdentityId: string;
  relationContext?: ForumRelationContext;
  candidate: ReturnType<typeof parseForumThreadCandidate>;
  trigger: "refresh" | "lazy";
  occurredAt: number;
  now: number;
}): { thread: ForumThread; replies: ForumReply[] } => {
  const character = input.relationContext?.character;
  const anonymous = Boolean(character && input.candidate.anonymous);
  const publicAuthor: ForumPublicAuthor = character
    ? anonymous
      ? anonymousAiAuthor()
      : {
          displayName: character.remark || character.name,
          avatar: character.avatar || undefined,
          kind: "ai-character",
          isAnonymous: false,
        }
    : virtualAuthor(input.candidate.virtualDisplayName);
  const threadId = id("forum-ai-thread");
  const thread: ForumThread = {
    id: threadId,
    ownerIdentityId: input.ownerIdentityId,
    publicAuthor,
    ...(character ? {
      privateAuthorRelationId: input.relationContext?.relationship.id,
      privateAuthorCharacterId: character?.id,
    } : {}),
    title: input.candidate.title,
    body: input.candidate.body,
    source: character
      ? anonymous ? "ai-character-anonymous" : "ai-character"
      : "ai-virtual",
    occurredAt: Math.min(input.now, input.occurredAt),
    baseLikeCount: 0,
    likedByIdentityIds: [],
    replyCount: 0,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const replies: ForumReply[] = [];
  for (const candidate of input.candidate.replies || []) {
    const floor = replies.length + 2;
    const replyTo = candidate.replyToFloor && candidate.replyToFloor >= 2 && candidate.replyToFloor < floor
      ? replies.find((reply) => reply.floor === candidate.replyToFloor)
      : undefined;
    replies.push({
      id: id("forum-ai-reply"),
      threadId,
      ownerIdentityId: input.ownerIdentityId,
      floor,
      kind: "reply",
      publicAuthor: candidate.anonymous
        ? { displayName: "匿名用户", kind: "anonymous-ai", isAnonymous: true }
        : virtualAuthor(candidate.displayName),
      body: candidate.body,
      ...(replyTo ? {
        replyToReplyId: replyTo.id,
        replyToFloor: replyTo.floor,
        replyToAuthorName: replyTo.publicAuthor.displayName,
        quotedText: replyTo.body.slice(0, 120),
      } : {}),
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

const requireTextAiConfig = (settings: UserSettings): void => {
  if (!settings.apiKey?.trim() || !settings.selectedModel?.trim()) {
    throw new Error("论坛 AI 配置缺失：请先在 API 设置中填写 API Key 并选择文本模型。");
  }
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
  aiCall?: ForumAiCall;
  preferredRelationId?: string;
}): Promise<ForumGenerationBundle> {
  requireTextAiConfig(input.settings);
  const random = input.random || Math.random;
  const relationContexts = input.relationships
    .filter((relation) =>
      relation.userIdentityId === input.ownerIdentityId
      && (!input.preferredRelationId || relation.id === input.preferredRelationId))
    .map((relationship) => buildForumRelationGenerationContext({ ...input, relationship }))
    .filter((value): value is ForumRelationContext => Boolean(value));
  const planned = Math.max(1, Math.min(5, Math.floor(input.count)));
  const threads: ForumThread[] = [];
  const replies: ForumReply[] = [];
  const fingerprints = new Set<string>();
  const aiCall = input.aiCall || defaultAiCall;
  for (let index = 0; index < planned; index += 1) {
    const useVirtual = relationContexts.length === 0
      || (input.trigger === "refresh" && random() < 0.25);
    const relationContext = useVirtual
      ? undefined
      : relationContexts[index % relationContexts.length];
    const prompt = buildThreadPrompt({ relationContext, trigger: input.trigger });
    const result = await aiCall({
      ...prompt,
      apiKey: input.settings.apiKey,
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
      apiTemperature: input.settings.apiTemperature,
      streamCompatible: input.settings.streamCompatible,
    });
    const candidate = parseForumThreadCandidate(result.text);
    const occurredAt = Math.min(input.now, input.now - (planned - index - 1) * 61_000);
    const generated = createGeneratedThread({
      ownerIdentityId: input.ownerIdentityId,
      relationContext,
      candidate,
      trigger: input.trigger,
      occurredAt,
      now: input.now,
    });
    const fingerprint = forumThreadFingerprint({
      ownerIdentityId: input.ownerIdentityId,
      title: generated.thread.title,
      body: generated.thread.body,
      authorScope: relationContext?.relationship.id || "virtual",
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
  aiCall?: ForumAiCall;
}): Promise<ForumReply[]> {
  requireTextAiConfig(input.settings);
  const relationContexts = input.relationships
    .filter((relation) => relation.userIdentityId === input.thread.ownerIdentityId)
    .map((relationship) => buildForumRelationGenerationContext({
      ownerIdentityId: input.thread.ownerIdentityId,
      relationship,
      characters: input.characters,
      messages: input.messages,
      memories: input.memories,
      worldBookEntries: input.worldBookEntries,
    }))
    .filter((value): value is ForumRelationContext => Boolean(value))
    .slice(0, Math.max(1, Math.min(3, input.maxReplies ?? 2)));
  const replyAuthors: Array<ForumRelationContext | undefined> =
    relationContexts.length > 0 ? relationContexts : [undefined];
  const aiCall = input.aiCall || defaultAiCall;
  const generated: ForumReply[] = [];
  for (const context of replyAuthors) {
    const result = await aiCall({
      systemInstruction: `你只生成一条对论坛主楼的自然回复。严格输出 JSON：{"body":"回复正文","anonymous":false}。不执行点赞、发帖、转发、删除，不输出任何 ID。`,
      message: `公开主楼作者：${input.thread.publicAuthor.displayName}
标题：${input.thread.title}
正文：${input.thread.body}
${context
    ? `请按当前角色和关系上下文回复，但不得泄露内部身份标识。用户匿名时也只能视为公开匿名作者。\n${context.promptContext}`
    : "请作为应用内虚拟论坛账号自然回复，不得冒充任何已有角色，也不得推断匿名用户身份。"}`,
      apiKey: input.settings.apiKey,
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
      apiTemperature: input.settings.apiTemperature,
      streamCompatible: input.settings.streamCompatible,
    });
    const candidate = parseForumReplyCandidate(result.text);
    const floor = Math.max(
      1,
      ...input.existingReplies
        .filter((reply) => reply.threadId === input.thread.id)
        .map((reply) => reply.floor),
      ...generated.map((reply) => reply.floor),
    ) + 1;
    generated.push({
      id: id("forum-ai-reply"),
      threadId: input.thread.id,
      ownerIdentityId: input.thread.ownerIdentityId,
      floor,
      kind: "reply",
      publicAuthor: candidate.anonymous
        ? anonymousAiAuthor()
        : context ? {
            displayName: context.character.remark || context.character.name,
            avatar: context.character.avatar || undefined,
            kind: "ai-character",
            isAnonymous: false,
          } : virtualAuthor("路过的论坛用户"),
      body: candidate.body,
      source: context
        ? candidate.anonymous ? "ai-character-anonymous" : "ai-character"
        : "ai-virtual",
      occurredAt: Math.min(input.now, Math.max(input.thread.occurredAt, input.thread.occurredAt + floor * 1000)),
      baseLikeCount: 0,
      likedByIdentityIds: [],
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
  return generated.filter((reply) => reply.occurredAt >= input.thread.occurredAt);
}

export interface ForumThreadActivityResult {
  outcome: "no-update" | "author-update" | "replies";
  replies: ForumReply[];
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
  return `公开作者：${thread.publicAuthor.displayName}
标题：${thread.title}
正文：${thread.body}
已有公开楼层：
${publicReplies || "无"}`;
};

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
    }))
    .filter((value): value is ForumRelationContext => Boolean(value));
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
  const chooseAuthorUpdate = canAuthorUpdate && random() < 0.5;
  const aiCall = input.aiCall || defaultAiCall;
  const baseFloor = Math.max(
    1,
    ...input.existingReplies
      .filter((reply) => reply.threadId === input.thread.id)
      .map((reply) => reply.floor),
  );
  const publicContext = publicThreadContext(input.thread, input.existingReplies);

  if (chooseAuthorUpdate) {
    const result = await aiCall({
      systemInstruction: `你只生成一条论坛楼主后续更新。严格输出 JSON：{"body":"更新正文"}。
不执行点赞、删除、转发，不修改原主楼，不输出任何 ID，不泄露匿名作者内部身份。`,
      message: `${publicContext}
请以原楼主的公开身份追加一条自然后续更新。
${originalAuthorContext
    ? `原作者自己的 relation 上下文：\n${originalAuthorContext.promptContext}`
    : "该帖来自应用内虚拟论坛账号，不读取任何角色私密上下文。"}`,
      apiKey: input.settings.apiKey,
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
      apiTemperature: input.settings.apiTemperature,
      streamCompatible: input.settings.streamCompatible,
    });
    const candidate = parseForumReplyCandidate(result.text);
    if (input.existingReplies.some((reply) =>
      reply.threadId === input.thread.id
      && reply.body.trim() === candidate.body.trim())) {
      return { outcome: "no-update", replies: [] };
    }
    const reply: ForumReply = {
      id: id("forum-author-update"),
      threadId: input.thread.id,
      ownerIdentityId: input.ownerIdentityId,
      floor: baseFloor + 1,
      kind: "author-update",
      publicAuthor: { ...input.thread.publicAuthor },
      body: candidate.body,
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
  const authors: Array<ForumRelationContext | undefined> = validContexts.length > 0
    ? Array.from({ length: requestedCount }, (_, index) => validContexts[index % validContexts.length])
    : [undefined];
  const generated: ForumReply[] = [];
  for (const context of authors) {
    const result = await aiCall({
      systemInstruction: `你只生成一条与当前论坛帖相关的新回复。严格输出 JSON：{"body":"回复正文","anonymous":false}。
不执行点赞、删除、转发，不输出任何 ID，不泄露匿名作者内部身份。`,
      message: `${publicContext}
${context
    ? `请按这个回复角色自己的独立 relation 上下文发言：\n${context.promptContext}`
    : "请作为应用内虚拟论坛账号自然回复，不得冒充原楼主或任何已有角色。"}`,
      apiKey: input.settings.apiKey,
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
      apiTemperature: input.settings.apiTemperature,
      streamCompatible: input.settings.streamCompatible,
    });
    const candidate = parseForumReplyCandidate(result.text);
    if ([...input.existingReplies, ...generated].some((reply) =>
      reply.threadId === input.thread.id && reply.body.trim() === candidate.body.trim())) continue;
    const floor = baseFloor + generated.length + 1;
    generated.push({
      id: id("forum-activity-reply"),
      threadId: input.thread.id,
      ownerIdentityId: input.ownerIdentityId,
      floor,
      kind: "reply",
      publicAuthor: candidate.anonymous
        ? anonymousAiAuthor()
        : context
          ? {
              displayName: context.character.remark || context.character.name,
              avatar: context.character.avatar || undefined,
              kind: "ai-character",
              isAnonymous: false,
            }
          : virtualAuthor("路过的论坛用户"),
      body: candidate.body,
      source: context
        ? candidate.anonymous ? "ai-character-anonymous" : "ai-character"
        : "ai-virtual",
      occurredAt: Math.min(input.now, Math.max(input.thread.occurredAt, input.now)),
      baseLikeCount: 0,
      likedByIdentityIds: [],
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
  return generated.length > 0
    ? { outcome: "replies", replies: generated }
    : { outcome: "no-update", replies: [] };
}
