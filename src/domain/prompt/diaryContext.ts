import type { DiaryShare, Message } from "../../types";

/** Never traverse entries here: only explicit frozen shares can reach chat prompts. */
export const buildRelationDiaryContext = (input: { ownerIdentityId: string; relationId: string; conversationId: string; messages: readonly Message[]; shares: readonly DiaryShare[]; now?: number }): string => {
  const now = input.now ?? Date.now();
  const recentMessageIds = new Set(input.messages.slice(-20).map((message) => message.id));
  const share = [...input.shares].reverse().find((item) => item.ownerIdentityId === input.ownerIdentityId && item.targetRelationId === input.relationId && item.conversationId === input.conversationId && (recentMessageIds.has(item.messageId) || now - item.createdAt <= 24 * 60 * 60 * 1000));
  if (!share) return "";
  const snapshot = share.snapshot;
  return `[明确分享的日记快照]\n作者：${snapshot.authorName}\n日期：${new Date(snapshot.occurredAt).toLocaleString("zh-CN")}\n${snapshot.title ? `标题：${snapshot.title}\n` : ""}${snapshot.body}\n${snapshot.emotionalState ? `心情：${snapshot.emotionalState}` : ""}\n只讨论这份用户明确分享的快照；不要声称读取过其他日记。`;
};

