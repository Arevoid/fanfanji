import type {
  Character,
  ForumActivityActorSlot,
  ForumActivityTask,
  ForumActorRef,
  ForumActorState,
  ForumPendingActivityEvent,
  ForumReply,
  ForumThread,
  MemoryItem,
  Message,
  UserSettings,
  WorldBookEntry,
} from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { createForumVirtualAuthor, getForumVirtualProfile, FORUM_VIRTUAL_PROFILES } from "../../../domain/forum/forumVirtualProfiles";
import { canScheduleStoryContinuation } from "../../../domain/forum/forumStoryArc";
import { parseForumGeneratedEventBatch, type ForumGeneratedEventBatch } from "../../../domain/forum/forumValidation";
import { buildForumProtectedNames, findForumPrivateNameViolation, isForumGeneratedReplyRelevant, validateForumGeneratedText } from "../../../domain/forum/forumContentSafety";
import { buildForumRelationGenerationContext } from "./forumGenerationService";
import { apiChat } from "../../../utils/apiHelper";

export const FORUM_ACTIVITY_CHECK_MIN_MS = 30_000;
export const FORUM_ACTIVITY_CHECK_MAX_MS = 90_000;
export const FORUM_AUTO_THREAD_COOLDOWN_MS = 12 * 60 * 1000;
export const FORUM_ACTOR_COOLDOWN_MS = 6 * 60 * 1000;
export const FORUM_MAX_AUTO_CALLS_HOURLY = 2;
export const FORUM_MAX_AUTO_CALLS_DAILY = 8;
export const FORUM_MAX_THREAD_RELEASES_HOURLY = 4;

export interface ForumActivityPlanInput {
  trigger: ForumActivityTask["trigger"];
  ownerIdentityId: string;
  thread: ForumThread;
  replies: readonly ForumReply[];
  actorStates: readonly ForumActorState[];
  relationships: readonly CharacterRelationship[];
  characters: readonly Character[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  worldBookEntries: readonly WorldBookEntry[];
  settings: UserSettings;
  now: number;
  random?: () => number;
  aiCall?: (input: { message: string; systemInstruction: string; apiKey: string; model: string; apiEndpoint?: string; apiTemperature?: number; streamCompatible?: boolean }) => Promise<{ text: string }>;
}

const id = (prefix: string): string => `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export const forumActorKey = (actor: ForumActorRef): string => actor.kind === "relationship"
  ? `relationship:${actor.relationId}`
  : `virtual:${actor.virtualProfileId}`;

const publicThreadText = (thread: ForumThread, replies: readonly ForumReply[]): string => {
  const visible = replies
    .filter((reply) => reply.threadId === thread.id && !reply.isDeleted)
    .sort((a, b) => a.floor - b.floor)
    .slice(-10)
    .map((reply) => `${reply.floor}楼 ${reply.publicAuthor.displayName}：${reply.body.slice(0, 240)}`)
    .join("\n");
  return `标题：${thread.title}\n主楼：${thread.body}\n公开楼层：\n${visible || "暂无"}`;
};

export const buildForumActivityActorSlots = (input: Omit<ForumActivityPlanInput, "actorStates" | "now" | "random" | "aiCall">): ForumActivityActorSlot[] => {
  const relationshipSlots = input.relationships
    .filter((relation) => relation.userIdentityId === input.ownerIdentityId)
    .map((relationship) => buildForumRelationGenerationContext({
      ownerIdentityId: input.ownerIdentityId,
      relationship,
      characters: input.characters,
      messages: input.messages,
      memories: input.memories,
      worldBookEntries: input.worldBookEntries,
      identities: input.settings.identities,
    }))
    .filter((context): context is NonNullable<typeof context> => Boolean(context))
    .slice(0, 2)
    .map((context, index): ForumActivityActorSlot => ({
      slotId: `relation-${index + 1}`,
      publicAuthor: {
        displayName: context.character.remark || context.character.name,
        ...(context.character.avatar ? { avatar: context.character.avatar } : {}),
        kind: "ai-character",
        isAnonymous: false,
      },
      actor: { kind: "relationship", relationId: context.relationship.id, characterId: context.character.id },
      safePublicStyle: context.publicReplyPersona.slice(0, 300),
    }));
  const virtualSlots = [0, 1, 2].map((offset): ForumActivityActorSlot => {
    const profile = getForumVirtualProfile(`${input.thread.id}:activity`, offset);
    return {
      slotId: `virtual-${offset + 1}`,
      publicAuthor: createForumVirtualAuthor(profile),
      actor: { kind: "virtual", virtualProfileId: profile.id },
      safePublicStyle: profile.publicStyle,
    };
  });
  const relationshipAuthor = input.thread.privateAuthorRelationId
    ? relationshipSlots.find((slot) => slot.actor.kind === "relationship" && slot.actor.relationId === input.thread.privateAuthorRelationId)
    : undefined;
  const relationAuthorSlot = relationshipAuthor ? [{
    ...relationshipAuthor,
    slotId: "thread-relationship-author",
    publicAuthor: { ...input.thread.publicAuthor },
  }] : [];
  const virtualAuthor = input.thread.source === "ai-virtual"
    ? FORUM_VIRTUAL_PROFILES.find((profile) => profile.displayName === input.thread.publicAuthor.displayName)
    : undefined;
  const authorSlot = virtualAuthor ? [{
    slotId: "thread-virtual-author",
    publicAuthor: createForumVirtualAuthor(virtualAuthor),
    actor: { kind: "virtual" as const, virtualProfileId: virtualAuthor.id },
    safePublicStyle: virtualAuthor.publicStyle,
  }] : [];
  return [...relationshipSlots, ...relationAuthorSlot, ...authorSlot, ...virtualSlots];
};

const actorIsThreadAuthor = (slot: ForumActivityActorSlot, thread: ForumThread): boolean =>
  (slot.actor.kind === "relationship"
    && slot.actor.relationId === thread.privateAuthorRelationId
    && slot.actor.characterId === thread.privateAuthorCharacterId)
  || (slot.actor.kind === "virtual"
    && thread.source === "ai-virtual"
    && slot.publicAuthor.displayName === thread.publicAuthor.displayName);

const validateBatch = (input: {
  batch: ForumGeneratedEventBatch;
  thread: ForumThread;
  replies: readonly ForumReply[];
  slots: readonly ForumActivityActorSlot[];
  protectedNames: readonly string[];
}): ForumGeneratedEventBatch => {
  const slotMap = new Map(input.slots.map((slot) => [slot.slotId, slot]));
  const earlier = new Set<string>();
  const usedActors: string[] = [];
  const valid = input.batch.events.flatMap((event) => {
    const replyTo = event.replyTo;
    const slot = slotMap.get(event.actorSlot);
    if (!slot) return [];
    if (event.kind === "author-update" && !actorIsThreadAuthor(slot, input.thread)) return [];
    if ((input.thread.source === "user" || input.thread.source === "user-anonymous") && event.kind === "author-update") return [];
    if (replyTo.type === "floor" && !input.replies.some((reply) => reply.floor === replyTo.floor && !reply.isDeleted)) return [];
    if (replyTo.type === "batch" && !earlier.has(replyTo.localId)) return [];
    if (usedActors.at(-1) === slot.slotId && replyTo.type !== "batch") return [];
    const safety = validateForumGeneratedText(event.body);
    if (!safety.valid || findForumPrivateNameViolation({
      text: safety.text,
      protectedNames: input.protectedNames,
      publicTexts: [input.thread.title, input.thread.body, ...input.replies.filter((reply) => !reply.isDeleted).map((reply) => reply.body)],
      allowedAuthorNames: slot.publicAuthor.isAnonymous ? [] : [slot.publicAuthor.displayName],
    })) return [];
    const target = replyTo.type === "floor" ? input.replies.find((reply) => reply.floor === replyTo.floor) : undefined;
    if (!isForumGeneratedReplyRelevant({ replyBody: safety.text, threadTitle: input.thread.title, threadBody: input.thread.body, targetBody: target?.body })) return [];
    earlier.add(event.localId);
    usedActors.push(slot.slotId);
    return [{ ...event, body: safety.text }];
  });
  return { events: valid };
};

const defaultAiCall = (input: Parameters<NonNullable<ForumActivityPlanInput["aiCall"]>>[0]) => apiChat({ ...input, history: [] });

/** One public-only AI call yields a scheduled batch; it never writes forum storage itself. */
export const planForumActivity = async (input: ForumActivityPlanInput): Promise<ForumPendingActivityEvent[]> => {
  if (!input.settings.apiKey?.trim() || !input.settings.selectedModel?.trim()) {
    throw new Error("论坛 AI 配置缺失：请先配置文本 API。");
  }
  if (input.thread.ownerIdentityId !== input.ownerIdentityId) return [];
  const slots = buildForumActivityActorSlots(input);
  if (!slots.length) return [];
  const recent = input.actorStates.filter((state) => state.threadId === input.thread.id && state.ownerIdentityId === input.ownerIdentityId);
  const eligible = slots.filter((slot) => {
    const state = recent.find((candidate) => candidate.actorKey === forumActorKey(slot.actor));
    return !state?.cooldownUntil || state.cooldownUntil <= input.now;
  });
  if (!eligible.length) return [];
  const storyContinuation = canScheduleStoryContinuation(input.thread, input.replies, input.now)
    && (input.random || Math.random)() < (input.thread.storyArc?.continuationProbability || 0);
  const prompt = {
    systemInstruction: `你只生成一批公开论坛活动候选，不执行任何写操作。严格输出 JSON：{"events":[{"localId":"e1","actorSlot":"slot","kind":"reply","body":"回复","replyTo":{"type":"thread"},"delaySeconds":30}]}。每批 1-4 条；actorSlot 只能来自白名单；不得输出任意 ID、私人聊天、Memory、关系、点赞、转发、删除、图片或动作描写。author-update 只可由真实 AI 楼主发出。${storyContinuation ? "当前是开放连载帖的合理后续窗口：第一条必须是楼主的 author-update，延续公开前文，不得改名或编造私密背景。" : ""}`,
    message: `${publicThreadText(input.thread, input.replies)}\n可用 actorSlots：${eligible.map((slot) => `${slot.slotId}｜${slot.publicAuthor.displayName}｜${slot.safePublicStyle}`).join("\n")}`,
  };
  const result = await (input.aiCall || defaultAiCall)({
    ...prompt,
    apiKey: input.settings.apiKey,
    model: input.settings.selectedModel,
    apiEndpoint: input.settings.apiEndpoint,
    apiTemperature: input.settings.apiTemperature,
    streamCompatible: input.settings.streamCompatible,
  });
  const protectedNames = buildForumProtectedNames({
    ownerIdentity: input.settings.identities?.find((identity) => identity.id === input.ownerIdentityId),
    characters: input.characters,
  });
  const batch = validateBatch({
    batch: parseForumGeneratedEventBatch(result.text),
    thread: input.thread,
    replies: input.replies,
    slots: eligible,
    protectedNames,
  });
  const batchId = id("forum-activity-batch");
  return batch.events.map((event, index) => {
    const slot = eligible.find((item) => item.slotId === event.actorSlot)!;
    const delay = index === 0 ? Math.max(0, event.delaySeconds || 0) : Math.max(30, event.delaySeconds || index * 45);
    return {
      id: id("forum-pending-event"),
      ownerIdentityId: input.ownerIdentityId,
      threadId: input.thread.id,
      batchId,
      localId: event.localId,
      actorSlotSnapshot: slot,
      privateActor: slot.actor,
      kind: event.kind,
      body: event.body,
      replyTarget: event.replyTo,
      scheduledAt: Math.min(input.now + delay * 1000, input.now + 5 * 60 * 1000),
      status: "pending",
      createdAt: input.now,
      updatedAt: input.now,
    };
  });
};

export const releaseForumPendingEvents = (input: {
  events: readonly ForumPendingActivityEvent[];
  threads: readonly ForumThread[];
  replies: readonly ForumReply[];
  actorStates: readonly ForumActorState[];
  ownerIdentityId: string;
  now: number;
  limit: number;
}): { events: ForumPendingActivityEvent[]; replies: ForumReply[]; actorStates: ForumActorState[] } => {
  const replies = [...input.replies];
  const events = input.events.map((event) => ({ ...event }));
  const states = [...input.actorStates];
  const due = events.filter((event) => event.ownerIdentityId === input.ownerIdentityId && event.status === "pending" && event.scheduledAt <= input.now)
    .sort((a, b) => a.scheduledAt - b.scheduledAt).slice(0, input.limit);
  for (const event of due) {
    const replyTarget = event.replyTarget;
    const thread = input.threads.find((item) => item.id === event.threadId && item.ownerIdentityId === event.ownerIdentityId);
    if (!thread) { event.status = "skipped"; event.updatedAt = input.now; continue; }
    const target = replyTarget.type === "floor"
      ? replies.find((reply) => reply.threadId === event.threadId && reply.floor === replyTarget.floor && !reply.isDeleted)
      : replyTarget.type === "batch"
        ? (() => { const parent = events.find((item) => item.batchId === event.batchId && item.localId === replyTarget.localId); return parent?.resolvedReplyId ? replies.find((reply) => reply.id === parent.resolvedReplyId && !reply.isDeleted) : undefined; })()
        : undefined;
    const floor = Math.max(1, ...replies.filter((reply) => reply.threadId === event.threadId).map((reply) => reply.floor)) + 1;
    const occurredAt = Math.min(input.now, Math.max(thread.occurredAt, event.scheduledAt));
    const reply: ForumReply = {
      id: id("forum-activity-reply"), threadId: thread.id, ownerIdentityId: thread.ownerIdentityId, floor,
      kind: event.kind, publicAuthor: { ...event.actorSlotSnapshot.publicAuthor }, body: event.body,
      ...(target ? { replyToReplyId: target.id, replyToFloor: target.floor, replyToAuthorName: target.publicAuthor.displayName, quotedText: target.body.slice(0, 120) } : {}),
      source: event.actorSlotSnapshot.actor.kind === "relationship" ? "ai-character" : "ai-virtual",
      occurredAt, baseLikeCount: 0, likedByIdentityIds: [], createdAt: input.now, updatedAt: input.now,
      privateActor: event.privateActor,
    };
    replies.push(reply);
    event.status = "released"; event.resolvedReplyId = reply.id; event.resolvedFloor = floor; event.updatedAt = input.now;
    const key = forumActorKey(event.privateActor || event.actorSlotSnapshot.actor);
    const index = states.findIndex((state) => state.ownerIdentityId === event.ownerIdentityId && state.threadId === event.threadId && state.actorKey === key);
    const next: ForumActorState = {
      ownerIdentityId: event.ownerIdentityId, threadId: event.threadId, actorKey: key, actor: event.privateActor || event.actorSlotSnapshot.actor,
      lastReplyAt: occurredAt, recentReplyIds: [reply.id, ...(index >= 0 ? states[index].recentReplyIds : [])].slice(0, 8),
      recentTopicFingerprints: [event.body.slice(0, 80), ...(index >= 0 ? states[index].recentTopicFingerprints : [])].slice(0, 8),
      hourlyReplyTimestamps: [occurredAt, ...(index >= 0 ? states[index].hourlyReplyTimestamps : [])].filter((time) => time >= input.now - 60 * 60 * 1000).slice(0, 3),
      cooldownUntil: input.now + FORUM_ACTOR_COOLDOWN_MS, updatedAt: input.now,
    };
    if (index >= 0) states[index] = next; else states.push(next);
  }
  return { events, replies, actorStates: states };
};

export const shouldAttemptAutomaticForumActivity = (input: {
  activityTasks: readonly ForumActivityTask[];
  ownerIdentityId: string;
  now: number;
}): boolean => {
  const recent = input.activityTasks.filter((task) => task.ownerIdentityId === input.ownerIdentityId && task.trigger === "automatic");
  const hourly = recent.filter((task) => task.startedAt >= input.now - 60 * 60 * 1000).length;
  const daily = recent.filter((task) => task.startedAt >= input.now - 24 * 60 * 60 * 1000).length;
  return hourly < FORUM_MAX_AUTO_CALLS_HOURLY && daily < FORUM_MAX_AUTO_CALLS_DAILY;
};
