import type { Character, ForumActivityTask, ForumReply, ForumThread, MemoryItem, Message, UserSettings, WorldBookEntry } from "../../../types";
import { createId as createApplicationId } from "../../../core/id/createId";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { commitForumMutation, getForumSnapshotForIdentity } from "../../../core/storage/repositories/forumRepository";
import { buildForumActivityActorSlots, planForumActivity, releaseForumPendingEvents, shouldAttemptAutomaticForumActivity } from "./forumActivityService";
import { applyForumStoryUpdate, canScheduleStoryContinuation } from "../../../domain/forum/forumStoryArc";
import { getForumThreadActivityAt } from "../../../domain/forum/forumData";

const id = (prefix: string): string => createApplicationId(prefix);

export interface ForumActivityRuntimeContext {
  ownerIdentityId: string;
  relationships: readonly CharacterRelationship[];
  characters: readonly Character[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  worldBookEntries: readonly WorldBookEntry[];
  settings: UserSettings;
  now?: () => number;
  random?: () => number;
}

const updateThreadsForReplies = (threads: readonly ForumThread[], replies: readonly ForumReply[], now = Date.now()): ForumThread[] => threads.map((thread) => {
  const latest = replies.filter((reply) => reply.threadId === thread.id && reply.ownerIdentityId === thread.ownerIdentityId)
    .reduce((value, reply) => Math.max(value, reply.updatedAt, reply.occurredAt), thread.updatedAt);
  const authorUpdate = replies.filter((reply) => reply.threadId === thread.id && reply.kind === "author-update").sort((a, b) => b.occurredAt - a.occurredAt)[0];
  const withArc = authorUpdate ? applyForumStoryUpdate(thread, authorUpdate, now) : thread;
  const lastActivityAt = getForumThreadActivityAt(thread, replies);
  return latest === thread.updatedAt
    && withArc === thread
    && thread.lastActivityAt === lastActivityAt
    ? thread
    : { ...withArc, updatedAt: latest, lastActivityAt };
});

export const releaseDueForumActivity = (context: ForumActivityRuntimeContext, limit = 1): ForumReply[] => {
  const now = context.now?.() ?? Date.now();
  const snapshot = getForumSnapshotForIdentity(context.ownerIdentityId);
  const tasks = snapshot.activityTasks;
  const allEvents = tasks.flatMap((task) => task.pendingEvents);
  const released = releaseForumPendingEvents({
    events: allEvents,
    threads: snapshot.threads,
    replies: snapshot.replies,
    actorStates: snapshot.actorStates,
    ownerIdentityId: context.ownerIdentityId,
    now,
    limit,
  });
  const changed = released.events.some((event, index) => event.status !== allEvents[index]?.status);
  if (!changed) return [];
  const eventMap = new Map(released.events.map((event) => [event.id, event]));
  const nextTasks = tasks.map((task) => ({
    ...task,
    pendingEvents: task.pendingEvents.map((event) => eventMap.get(event.id) || event),
    updatedAt: now,
  }));
  const newReplies = released.replies.slice(snapshot.replies.length);
  const nextThreads = updateThreadsForReplies(snapshot.threads, released.replies, now);
  const result = commitForumMutation({ replies: released.replies, threads: nextThreads, actorStates: released.actorStates, activityTasks: nextTasks },
    newReplies.map((reply) => ({ type: "reply-created" as const, ownerIdentityId: reply.ownerIdentityId, threadId: reply.threadId, replyId: reply.id, publicAuthor: reply.publicAuthor, occurredAt: reply.occurredAt })));
  return result.success ? newReplies : [];
};

export const forceForumThreadActivity = async (context: ForumActivityRuntimeContext, threadId: string): Promise<{ outcome: "planned" | "no-update"; released: ForumReply[] }> => {
  const now = context.now?.() ?? Date.now();
  const snapshot = getForumSnapshotForIdentity(context.ownerIdentityId);
  const thread = snapshot.threads.find((item) => item.id === threadId);
  if (!thread) throw new Error("帖子不存在或不属于当前身份。");
  if (snapshot.activityTasks.some((task) => task.threadId === threadId
    && task.trigger === "manual-thread-refresh"
    && now - task.startedAt < 60_000)) {
    throw new Error("请稍候再刷新帖子动态。");
  }
  const events = await planForumActivity({
    trigger: "manual-thread-refresh", ownerIdentityId: context.ownerIdentityId, thread,
    replies: snapshot.replies, actorStates: snapshot.actorStates, relationships: context.relationships,
    characters: context.characters, messages: context.messages, memories: context.memories,
    worldBookEntries: context.worldBookEntries, settings: context.settings, now, random: context.random,
  });
  if (!events.length) return { outcome: "no-update", released: [] };
  const task: ForumActivityTask = {
    id: id("forum-activity-task"), ownerIdentityId: context.ownerIdentityId, threadId,
    trigger: "manual-thread-refresh", status: "succeeded", startedAt: now,
    completedAt: now, pendingEvents: events, createdAt: now, updatedAt: now,
  };
  if (!commitForumMutation({ activityTasks: [...snapshot.activityTasks, task] }).success) throw new Error("保存失败");
  // Explicit refresh makes the first valid activity visible immediately. Others retain their schedule.
  const first = events[0];
  if (first && first.scheduledAt > now) {
    const current = getForumSnapshotForIdentity(context.ownerIdentityId);
    commitForumMutation({ activityTasks: current.activityTasks.map((item) => item.id === task.id
      ? { ...item, pendingEvents: item.pendingEvents.map((event) => event.id === first.id ? { ...event, scheduledAt: now, updatedAt: now } : event) }
      : item) });
  }
  return { outcome: "planned", released: releaseDueForumActivity(context, 1) };
};

/** User-post initial replies use the same pending/release path as runtime activity. */
export const scheduleInitialForumReplies = async (context: ForumActivityRuntimeContext, threadId: string): Promise<ForumReply[]> => {
  const now = context.now?.() ?? Date.now();
  const snapshot = getForumSnapshotForIdentity(context.ownerIdentityId);
  const thread = snapshot.threads.find((item) => item.id === threadId);
  if (!thread || thread.ownerIdentityId !== context.ownerIdentityId) return [];
  if (snapshot.activityTasks.some((task) => task.threadId === threadId && task.trigger === "initial-replies")) return [];
  let events = await planForumActivity({
    trigger: "initial-replies", ownerIdentityId: context.ownerIdentityId, thread,
    replies: snapshot.replies, actorStates: snapshot.actorStates, relationships: context.relationships,
    characters: context.characters, messages: context.messages, memories: context.memories,
    worldBookEntries: context.worldBookEntries, settings: context.settings, now, random: context.random,
  });
  // A user-created thread always deserves at least one visible forum response.
  // This is a safe local fallback only when the model returns no valid event.
  if (!events.length) {
    const slot = buildForumActivityActorSlots({
      trigger: "initial-replies", ownerIdentityId: context.ownerIdentityId, thread,
      replies: snapshot.replies, relationships: context.relationships, characters: context.characters,
      messages: context.messages, memories: context.memories, worldBookEntries: context.worldBookEntries,
      settings: context.settings, random: context.random,
    }).find((candidate) => candidate.actor.kind === "virtual");
    if (!slot) return [];
    events = [{
      id: id("forum-pending-event"), ownerIdentityId: context.ownerIdentityId, threadId,
      batchId: id("forum-activity-batch"), localId: "fallback-initial", actorSlotSnapshot: slot,
      privateActor: slot.actor, kind: "reply", body: "先蹲一下，想听楼主后续。",
      replyTarget: { type: "thread" }, scheduledAt: now, status: "pending", createdAt: now, updatedAt: now,
    }];
  }
  const first = events[0];
  const task: ForumActivityTask = {
    id: id("forum-activity-task"), ownerIdentityId: context.ownerIdentityId, threadId,
    trigger: "initial-replies", status: "succeeded", startedAt: now, completedAt: now,
    pendingEvents: events.map((event) => event.id === first.id ? { ...event, scheduledAt: now, updatedAt: now } : event),
    createdAt: now, updatedAt: now,
  };
  if (!commitForumMutation({ activityTasks: [...snapshot.activityTasks, task] }).success) throw new Error("保存失败");
  return releaseDueForumActivity(context, 1);
};

/**
 * A user reply is a direct social prompt.  Queue a public-only response batch
 * targeted at that floor so the other participants can answer and continue the
 * discussion without requiring the user to press refresh.
 */
export const scheduleForumUserInteraction = async (
  context: ForumActivityRuntimeContext,
  threadId: string,
  replyFloor: number,
): Promise<ForumReply[]> => {
  const now = context.now?.() ?? Date.now();
  const snapshot = getForumSnapshotForIdentity(context.ownerIdentityId);
  const thread = snapshot.threads.find((item) => item.id === threadId && item.ownerIdentityId === context.ownerIdentityId);
  if (!thread || !Number.isInteger(replyFloor) || replyFloor < 2) return [];
  // A real forum does not answer every single floor. Keep a high but non-total
  // response rate so the author still feels noticed without producing bot-like noise.
  if ((context.random || Math.random)() >= 0.9) return [];
  const recentInteraction = snapshot.activityTasks.some((task) => task.threadId === threadId
    && task.trigger === "user-interaction"
    && task.startedAt >= now - 45_000);
  if (recentInteraction) return [];
  const events = await planForumActivity({
    trigger: "user-interaction",
    ownerIdentityId: context.ownerIdentityId,
    thread,
    replies: snapshot.replies,
    actorStates: snapshot.actorStates,
    relationships: context.relationships,
    characters: context.characters,
    messages: context.messages,
    memories: context.memories,
    worldBookEntries: context.worldBookEntries,
    settings: context.settings,
    now,
    random: context.random,
    requiredReplyFloor: replyFloor,
    ignoreActorCooldown: true,
  });
  if (!events.length) return [];
  const first = events[0];
  const task: ForumActivityTask = {
    id: id("forum-activity-task"),
    ownerIdentityId: context.ownerIdentityId,
    threadId,
    trigger: "user-interaction",
    status: "succeeded",
    startedAt: now,
    completedAt: now,
    pendingEvents: events.map((event) => event.id === first.id
      ? { ...event, scheduledAt: now, updatedAt: now }
      : event),
    createdAt: now,
    updatedAt: now,
  };
  const latestSnapshot = getForumSnapshotForIdentity(context.ownerIdentityId);
  if (latestSnapshot.activityTasks.some((item) => item.threadId === threadId
    && item.trigger === "user-interaction"
    && item.startedAt >= now - 45_000)) return [];
  if (!commitForumMutation({ activityTasks: [...latestSnapshot.activityTasks, task] }).success) return [];
  return releaseDueForumActivity(context, 1);
};

export const runAutomaticForumActivityCheck = async (context: ForumActivityRuntimeContext): Promise<{ attempted: boolean; released: ForumReply[] }> => {
  const released = releaseDueForumActivity(context, 1);
  if (released.length) return { attempted: false, released };
  const now = context.now?.() ?? Date.now();
  const snapshot = getForumSnapshotForIdentity(context.ownerIdentityId);
  if (!context.settings.apiKey?.trim() || !context.settings.selectedModel?.trim()
    || !shouldAttemptAutomaticForumActivity({ activityTasks: snapshot.activityTasks, ownerIdentityId: context.ownerIdentityId, now })) {
    return { attempted: false, released: [] };
  }
  const eligibleThreads = [...snapshot.threads]
    .filter((candidate) => {
      if (candidate.source !== "user" && candidate.source !== "user-anonymous") return true;
      // A failed/empty initial-reply plan should be recoverable on the next
      // background tick, while a successfully queued user post is handled by
      // its existing pending events and should not be duplicated.
      return now - candidate.createdAt >= 2 * 60 * 1000
        && !snapshot.activityTasks.some((task) => task.threadId === candidate.id
        && task.trigger === "initial-replies"
        && task.status === "succeeded");
    })
    .sort((a, b) => {
      const storyA = canScheduleStoryContinuation(a, snapshot.replies, now) ? 1 : 0;
      const storyB = canScheduleStoryContinuation(b, snapshot.replies, now) ? 1 : 0;
      return storyB - storyA || b.updatedAt - a.updatedAt;
    });
  const thread = eligibleThreads
    .find((candidate) => !snapshot.activityTasks.some((task) => task.threadId === candidate.id && task.trigger === "automatic" && now - task.startedAt < 12 * 60 * 1000));
  if (!thread) return { attempted: false, released: [] };
  try {
    const events = await planForumActivity({
      trigger: "automatic", ownerIdentityId: context.ownerIdentityId, thread,
      replies: snapshot.replies, actorStates: snapshot.actorStates, relationships: context.relationships,
      characters: context.characters, messages: context.messages, memories: context.memories,
      worldBookEntries: context.worldBookEntries, settings: context.settings, now, random: context.random,
    });
    const task: ForumActivityTask = {
      id: id("forum-activity-task"), ownerIdentityId: context.ownerIdentityId, threadId: thread.id,
      trigger: "automatic", status: events.length ? "succeeded" : "failed", startedAt: now,
      completedAt: now, ...(events.length ? {} : { retryAfter: now + 5 * 60 * 1000 }), pendingEvents: events,
      createdAt: now, updatedAt: now,
    };
    commitForumMutation({ activityTasks: [...snapshot.activityTasks, task] });
    return { attempted: true, released: releaseDueForumActivity(context, 1) };
  } catch {
    // Automatic failures are deliberately silent; the persisted backoff prevents rapid retries.
    const failed: ForumActivityTask = { id: id("forum-activity-task"), ownerIdentityId: context.ownerIdentityId, threadId: thread.id, trigger: "automatic", status: "failed", startedAt: now, completedAt: now, retryAfter: now + 5 * 60 * 1000, pendingEvents: [], createdAt: now, updatedAt: now };
    commitForumMutation({ activityTasks: [...snapshot.activityTasks, failed] });
    return { attempted: true, released: [] };
  }
};
