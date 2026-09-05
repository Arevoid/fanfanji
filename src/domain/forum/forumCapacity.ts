import type { ForumActivityTask, ForumGenerationTask, ForumLikeHistoryRecord, ForumNotification, ForumVisitHistory } from "../../types";

export const FORUM_HOME_PAGE_SIZE = 30;
export const FORUM_REPLY_PAGE_SIZE = 50;
export const FORUM_HISTORY_LIMIT = 200;
export const FORUM_LIKE_LIMIT = 300;
export const FORUM_NOTIFICATION_LIMIT = 300;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const capPerIdentity = <T extends { ownerIdentityId: string }>(items: readonly T[], limit: number, timestamp: (item: T) => number): T[] => Object.values(items.reduce<Record<string, T[]>>((groups, item) => { (groups[item.ownerIdentityId] ||= []).push(item); return groups; }, {})).flatMap((group) => group.sort((a, b) => timestamp(b) - timestamp(a)).slice(0, limit));

export const estimateForumStorageUsage = (state: unknown): { bytes: number; readable: string } => {
  const bytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
  return { bytes, readable: `${(bytes / 1024).toFixed(bytes > 1024 * 1024 ? 0 : 1)} KB` };
};

export const compactForumState = (input: { visitHistory: ForumVisitHistory[]; likeHistory: ForumLikeHistoryRecord[]; notifications: ForumNotification[]; generationTasks: ForumGenerationTask[]; activityTasks: ForumActivityTask[]; now?: number }) => {
  const now = input.now || Date.now();
  return {
    visitHistory: capPerIdentity(input.visitHistory, FORUM_HISTORY_LIMIT, (item) => item.lastVisitedAt),
    likeHistory: capPerIdentity(input.likeHistory, FORUM_LIKE_LIMIT, (item) => item.likedAt),
    notifications: capPerIdentity(input.notifications, FORUM_NOTIFICATION_LIMIT, (item) => item.occurredAt),
    generationTasks: input.generationTasks.filter((item) => !(item.status !== "running" && now - (item.completedAt || item.updatedAt) > THIRTY_DAYS)),
    activityTasks: input.activityTasks.filter((item) => !(item.status !== "running" && now - (item.completedAt || item.updatedAt) > THIRTY_DAYS)),
  };
};

export const validateForumStorageLimits = (_state: Parameters<typeof compactForumState>[0]): string[] => [];
