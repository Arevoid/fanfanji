import type { ForumActivityTask, ForumDmConversation, ForumDmMessage, ForumDmTask, ForumGenerationTask, ForumLikeHistoryRecord, ForumNotification, ForumVisitHistory } from "../../types";

export const FORUM_HOME_PAGE_SIZE = 30;
export const FORUM_REPLY_PAGE_SIZE = 50;
export const FORUM_HISTORY_LIMIT = 200;
export const FORUM_LIKE_LIMIT = 300;
export const FORUM_NOTIFICATION_LIMIT = 300;
export const FORUM_DM_CONVERSATION_LIMIT = 100;
export const FORUM_DM_MESSAGE_LIMIT = 500;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const capPerIdentity = <T extends { ownerIdentityId: string }>(items: readonly T[], limit: number, timestamp: (item: T) => number): T[] => Object.values(items.reduce<Record<string, T[]>>((groups, item) => { (groups[item.ownerIdentityId] ||= []).push(item); return groups; }, {})).flatMap((group) => group.sort((a, b) => timestamp(b) - timestamp(a)).slice(0, limit));

export const estimateForumStorageUsage = (state: unknown): { bytes: number; readable: string } => {
  const bytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
  return { bytes, readable: `${(bytes / 1024).toFixed(bytes > 1024 * 1024 ? 0 : 1)} KB` };
};

export const compactForumState = (input: { visitHistory: ForumVisitHistory[]; likeHistory: ForumLikeHistoryRecord[]; notifications: ForumNotification[]; dmConversations: ForumDmConversation[]; dmMessages: ForumDmMessage[]; dmTasks: ForumDmTask[]; generationTasks: ForumGenerationTask[]; activityTasks: ForumActivityTask[]; now?: number }) => {
  const now = input.now || Date.now();
  const validConversationIds = new Set(capPerIdentity(input.dmConversations, FORUM_DM_CONVERSATION_LIMIT, (item) => item.lastMessageAt).map((item) => item.id));
  return {
    visitHistory: capPerIdentity(input.visitHistory, FORUM_HISTORY_LIMIT, (item) => item.lastVisitedAt),
    likeHistory: capPerIdentity(input.likeHistory, FORUM_LIKE_LIMIT, (item) => item.likedAt),
    notifications: capPerIdentity(input.notifications, FORUM_NOTIFICATION_LIMIT, (item) => item.occurredAt),
    dmConversations: input.dmConversations.filter((item) => validConversationIds.has(item.id)),
    dmMessages: input.dmMessages.filter((item) => validConversationIds.has(item.conversationId)).sort((a, b) => a.occurredAt - b.occurredAt).filter((item, _index, all) => all.filter((candidate) => candidate.conversationId === item.conversationId && candidate.occurredAt >= item.occurredAt).length <= FORUM_DM_MESSAGE_LIMIT),
    dmTasks: input.dmTasks.filter((item) => validConversationIds.has(item.conversationId) && !(item.status !== "running" && now - (item.completedAt || item.updatedAt) > THIRTY_DAYS)),
    generationTasks: input.generationTasks.filter((item) => !(item.status !== "running" && now - (item.completedAt || item.updatedAt) > THIRTY_DAYS)),
    activityTasks: input.activityTasks.filter((item) => !(item.status !== "running" && now - (item.completedAt || item.updatedAt) > THIRTY_DAYS)),
  };
};

export const validateForumStorageLimits = (state: Parameters<typeof compactForumState>[0]): string[] => {
  const compacted = compactForumState(state);
  const issues: string[] = [];
  if (compacted.dmConversations.length !== state.dmConversations.length) issues.push("论坛私信会话已超过容量上限");
  if (compacted.dmMessages.length !== state.dmMessages.length) issues.push("论坛私信消息已超过容量上限");
  return issues;
};
