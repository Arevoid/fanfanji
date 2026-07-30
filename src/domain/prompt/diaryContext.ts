import type { DiaryShare, Message } from "../../types";

/** Never traverse entries here: only explicit frozen shares can reach chat prompts. */
export const buildRelationDiaryContext = (input: { ownerIdentityId: string; relationId: string; conversationId: string; messages: readonly Message[]; shares: readonly DiaryShare[]; now?: number }): string => {
  const now = input.now ?? Date.now();
  const recentMessageIds = new Set(input.messages.slice(-20).map((message) => message.id));
  const share = [...input.shares].reverse().find((item) => item.ownerIdentityId === input.ownerIdentityId && item.targetRelationId === input.relationId && item.conversationId === input.conversationId && (recentMessageIds.has(item.messageId) || now - item.createdAt <= 24 * 60 * 60 * 1000));
  if (!share) return "";

  const snapshot = share.snapshot;
  const authorRole = snapshot.authorType === "character" ? "the character you are speaking as" : "the user";
  const authorResponseRule = snapshot.authorType === "character"
    ? "This is your own diary entry. Never describe it as something the user wrote; respond as its author."
    : "This is the user's diary entry. Do not claim that you wrote it.";

  return `[Explicitly shared diary snapshot]\nAuthor role: ${authorRole}\nAuthor name: ${snapshot.authorName}\nDate: ${new Date(snapshot.occurredAt).toLocaleString("zh-CN")}\n${snapshot.title ? `Title: ${snapshot.title}\n` : ""}${snapshot.body}\n${snapshot.emotionalState ? `Mood: ${snapshot.emotionalState}\n` : ""}${authorResponseRule}\nDiscuss only this explicitly shared snapshot; do not claim to have read any other diary entries.`;
};
