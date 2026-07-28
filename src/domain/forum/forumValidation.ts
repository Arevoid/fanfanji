import type { ForumReply, ForumThread } from "../../types";
import { validateForumGeneratedText } from "./forumContentSafety";

export interface ForumGeneratedReplyCandidate {
  body: string;
  displayName?: string;
  anonymous?: boolean;
  replyToFloor?: number | null;
}

export interface ForumGeneratedThreadCandidate {
  title: string;
  body: string;
  anonymous?: boolean;
  virtualDisplayName?: string;
  replies?: ForumGeneratedReplyCandidate[];
}

const normalize = (value: string): string =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");

const similarity = (left: string, right: string): number => {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const pairs = (value: string) => {
    const result = new Map<string, number>();
    for (let index = 0; index < value.length - 1; index += 1) {
      const pair = value.slice(index, index + 2);
      result.set(pair, (result.get(pair) || 0) + 1);
    }
    return result;
  };
  const leftPairs = pairs(left);
  const rightPairs = pairs(right);
  let overlap = 0;
  leftPairs.forEach((count, pair) => {
    overlap += Math.min(count, rightPairs.get(pair) || 0);
  });
  return (2 * overlap) / (left.length + right.length - 2);
};

export const forumThreadFingerprint = (input: {
  ownerIdentityId: string;
  title: string;
  body: string;
  authorScope: string;
  trigger: string;
}): string => [
  input.ownerIdentityId,
  input.trigger,
  input.authorScope,
  normalize(input.title).slice(0, 80),
  normalize(input.body).slice(0, 180),
].join("|");

export const isForumThreadDuplicate = (
  candidate: Pick<ForumThread, "title" | "body" | "ownerIdentityId">,
  persisted: readonly ForumThread[],
): boolean => {
  const title = normalize(candidate.title);
  const body = normalize(candidate.body).slice(0, 180);
  return persisted.some((thread) =>
    thread.ownerIdentityId === candidate.ownerIdentityId && (() => {
      const existingTitle = normalize(thread.title);
      const existingBody = normalize(thread.body).slice(0, 180);
      return existingTitle === title
        || similarity(existingTitle, title) >= 0.9
        || (body.length >= 24 && similarity(existingBody, body) >= 0.88);
    })());
};

const extractJsonValue = (text: string): unknown => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const firstObject = cleaned.indexOf("{");
  const firstArray = cleaned.indexOf("[");
  const start = firstArray >= 0 && (firstObject < 0 || firstArray < firstObject) ? firstArray : firstObject;
  if (start < 0) throw new Error("结构解析失败：AI 未返回 JSON。");
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (end < start) throw new Error("结构解析失败：AI 返回的 JSON 不完整。");
  return JSON.parse(cleaned.slice(start, end + 1));
};

const cleanText = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const cleanGeneratedText = (value: unknown, maxLength: number, label: string): string => {
  const candidate = cleanText(value, maxLength);
  const validated = validateForumGeneratedText(candidate);
  if (!validated.valid) {
    throw new Error(`生成内容无效：${label}不是安全的论坛纯文本。`);
  }
  return validated.text;
};

export const parseForumThreadCandidate = (text: string): ForumGeneratedThreadCandidate => {
  const raw = extractJsonValue(text);
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "object") throw new Error("结构解析失败：帖子对象无效。");
  const record = value as Record<string, unknown>;
  const title = cleanGeneratedText(record.title, 80, "帖子标题");
  const body = cleanGeneratedText(record.body, 5000, "帖子正文");
  if (!title || !body) throw new Error("生成内容无效：帖子标题或正文为空。");
  const replies = Array.isArray(record.replies)
    ? record.replies.slice(0, 5).flatMap((item): ForumGeneratedReplyCandidate[] => {
        if (!item || typeof item !== "object") return [];
        const reply = item as Record<string, unknown>;
        const replyBody = cleanGeneratedText(reply.body, 2000, "帖子附带回复");
        if (!replyBody) return [];
        return [{
          body: replyBody,
          ...(cleanText(reply.displayName, 24) ? { displayName: cleanText(reply.displayName, 24) } : {}),
          ...(typeof reply.anonymous === "boolean" ? { anonymous: reply.anonymous } : {}),
          ...(reply.replyToFloor === null
            ? { replyToFloor: null }
            : Number.isInteger(reply.replyToFloor)
              ? { replyToFloor: Number(reply.replyToFloor) }
              : {}),
        }];
      })
    : [];
  return {
    title,
    body,
    ...(typeof record.anonymous === "boolean" ? { anonymous: record.anonymous } : {}),
    ...(cleanText(record.virtualDisplayName, 24)
      ? { virtualDisplayName: cleanText(record.virtualDisplayName, 24) }
      : {}),
    replies,
  };
};

export const parseForumReplyCandidate = (text: string): ForumGeneratedReplyCandidate => {
  const raw = extractJsonValue(text);
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "object") throw new Error("结构解析失败：回复对象无效。");
  const record = value as Record<string, unknown>;
  const body = cleanGeneratedText(record.body, 2000, "回复");
  if (!body) throw new Error("生成内容无效：回复为空。");
  return {
    body,
    ...(typeof record.anonymous === "boolean" ? { anonymous: record.anonymous } : {}),
    ...(record.replyToFloor === null
      ? { replyToFloor: null }
      : Number.isInteger(record.replyToFloor)
        ? { replyToFloor: Number(record.replyToFloor) }
        : {}),
  };
};

export const validateForumReplyTimeline = (
  thread: ForumThread,
  replies: readonly ForumReply[],
): boolean => replies.every((reply) =>
  reply.threadId === thread.id
  && reply.ownerIdentityId === thread.ownerIdentityId
  && reply.floor >= 2
  && reply.occurredAt >= thread.occurredAt
  && (!reply.replyToFloor || (() => {
    if (reply.replyToFloor >= reply.floor) return false;
    const target = replies.find((candidate) =>
      candidate.threadId === reply.threadId
      && candidate.floor === reply.replyToFloor);
    return Boolean(
      target
      && reply.replyToReplyId === target.id
      && reply.replyToAuthorName === target.publicAuthor.displayName
      && reply.quotedText === (target.isDeleted ? "该回复已删除" : target.body.slice(0, 120)),
    );
  })()));
