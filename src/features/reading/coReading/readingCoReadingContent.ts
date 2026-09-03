import { appendDiscussionMessage, createReadingComment, createReadingDiscussion, getAiReadingState, listDiscussionMessages, listReadingComments, listReadingDiscussions, saveAiReadingState } from "../../../core/storage/repositories/readingCoReadingRepository";
import { loadReadingStore } from "../../../core/storage/repositories/readingRepository";
import { buildAiReadingContext } from "./aiReadingBoundary";
import type { ReadingComment, ReadingCommentAuthor, ReadingCommentKind, ReadingCommentSource, ReadingDiscussion, ReadingDiscussionMessage } from "../../../domain/reading/coReadingTypes";
import type { ReadingRoomScope } from "../../../domain/reading/types";
import { createId as createApplicationId } from "../../../core/id/createId";

const createId = (prefix: string): string => createApplicationId(prefix);

export class ReadingCoReadingContentError extends Error {
  constructor(message: string, public readonly code: "validation" | "scope" | "spoiler" | "storage" = "validation") {
    super(message);
    this.name = "ReadingCoReadingContentError";
  }
}

function saveComment(comment: ReadingComment): ReadingComment {
  const result = createReadingComment(comment);
  if (!result.success) throw new ReadingCoReadingContentError("共读评论保存失败。", result.error === "scope" ? "scope" : "storage");
  return comment;
}

export function createUserReadingComment(input: {
  scope: ReadingRoomScope;
  authorName: string;
  kind: ReadingCommentKind;
  body: string;
  targetChapterId?: string;
  targetParagraphAnchorId?: string;
  parentCommentId?: string;
  textSnapshot?: string;
  isSpoiler?: boolean;
  now?: number;
}): ReadingComment {
  const body = input.body.trim();
  if (!input.authorName.trim() || !body || body.length > 12000) throw new ReadingCoReadingContentError("评论内容不能为空或超过 12000 字。");
  const now = input.now ?? Date.now();
  return saveComment({
    ...input.scope,
    id: createId("reading-comment"),
    kind: input.kind,
    author: "user",
    authorName: input.authorName.trim(),
    targetChapterId: input.targetChapterId,
    targetParagraphAnchorId: input.targetParagraphAnchorId,
    parentCommentId: input.parentCommentId,
    textSnapshot: input.textSnapshot,
    body,
    source: input.isSpoiler ? "user_revealed" : "known",
    isSpoiler: Boolean(input.isSpoiler),
    createdAt: now,
    updatedAt: now,
  });
}

/** AI comments must carry a paragraph snapshot that is inside the room's knowledge boundary. */
export function createAiReadingComment(input: {
  scope: ReadingRoomScope;
  authorName: string;
  targetParagraphAnchorId: string;
  textSnapshot: string;
  body: string;
  targetChapterId?: string;
  parentCommentId?: string;
  isSpoiler?: boolean;
  now?: number;
}): ReadingComment {
  const body = input.body.trim();
  if (!input.authorName.trim() || !body || !input.textSnapshot.trim()) throw new ReadingCoReadingContentError("AI 评论缺少必要内容。");
  const anchor = loadReadingStore().value.paragraphAnchors.find((candidate) => candidate.userIdentityId === input.scope.userIdentityId && candidate.bookId === input.scope.bookId && candidate.id === input.targetParagraphAnchorId);
  if (!anchor) throw new ReadingCoReadingContentError("AI 评论目标段落不存在。", "scope");
  const projection = buildAiReadingContext(input.scope, [{ anchor, textSnapshot: input.textSnapshot }]);
  const source: ReadingCommentSource = projection.knownFragments.length > 0 ? "known" : projection.userRevealedSpoilers.length > 0 ? "user_revealed" : "known";
  if (!projection.knownFragments.length && !projection.userRevealedSpoilers.length) throw new ReadingCoReadingContentError("AI 不能评论尚未读到或未被用户明确分享的段落。", "spoiler");
  const now = input.now ?? Date.now();
  if (input.parentCommentId && !listReadingComments(input.scope).some((comment) => comment.id === input.parentCommentId)) throw new ReadingCoReadingContentError("回复的评论不存在于当前共读房间。", "scope");
  const comment = saveComment({
    ...input.scope,
    id: createId("reading-ai-comment"),
    kind: input.parentCommentId ? "reply" : "paragraph",
    author: "ai",
    authorName: input.authorName.trim(),
    targetChapterId: input.targetChapterId || anchor.chapterId,
    targetParagraphAnchorId: input.targetParagraphAnchorId,
    parentCommentId: input.parentCommentId,
    textSnapshot: input.textSnapshot,
    body,
    source,
    isSpoiler: Boolean(input.isSpoiler || source === "user_revealed"),
    createdAt: now,
    updatedAt: now,
  });
  const state = getAiReadingState(input.scope);
  if (state) saveAiReadingState({ ...state, lastCommentedAnchor: anchor, updatedAt: now });
  return comment;
}

export function startReadingDiscussion(input: {
  scope: ReadingRoomScope;
  authorName: string;
  userPrompt: string;
  targetChapterId?: string;
  targetParagraphAnchorId?: string;
  frozenFragment?: string;
  now?: number;
}): ReadingDiscussion {
  const prompt = input.userPrompt.trim();
  if (!input.authorName.trim() || !prompt || prompt.length > 4000) throw new ReadingCoReadingContentError("召唤内容不能为空或超过 4000 字。");
  if (input.frozenFragment && input.frozenFragment.length > 8000) throw new ReadingCoReadingContentError("召唤片段不能超过 8000 字。", "spoiler");
  const now = input.now ?? Date.now();
  const discussion: ReadingDiscussion = { ...input.scope, id: createId("reading-discussion"), status: "pending_ai", targetChapterId: input.targetChapterId, targetParagraphAnchorId: input.targetParagraphAnchorId, frozenFragment: input.frozenFragment, userPrompt: prompt, createdAt: now, updatedAt: now };
  const firstMessage: ReadingDiscussionMessage = { ...input.scope, id: createId("reading-discussion-message"), discussionId: discussion.id, author: "user", authorName: input.authorName.trim(), body: prompt, source: input.frozenFragment ? "user_revealed" : "known", createdAt: now };
  const result = createReadingDiscussion(discussion, firstMessage);
  if (!result.success) throw new ReadingCoReadingContentError("召唤讨论保存失败。", result.error === "scope" ? "scope" : "storage");
  return discussion;
}

export function appendReadingDiscussionMessage(input: {
  scope: ReadingRoomScope;
  discussionId: string;
  author: ReadingCommentAuthor;
  authorName: string;
  body: string;
  source?: ReadingCommentSource;
  now?: number;
}): ReadingDiscussionMessage {
  const body = input.body.trim();
  if (!input.discussionId || !input.authorName.trim() || !body || body.length > 12000) throw new ReadingCoReadingContentError("讨论内容不能为空或超过 12000 字。");
  const message: ReadingDiscussionMessage = {
    ...input.scope,
    id: createId("reading-discussion-message"),
    discussionId: input.discussionId,
    author: input.author,
    authorName: input.authorName.trim(),
    body,
    source: input.source || "known",
    createdAt: input.now ?? Date.now(),
  };
  const result = appendDiscussionMessage(message, input.author === "ai" ? "open" : "pending_ai");
  if (!result.success) throw new ReadingCoReadingContentError("讨论消息保存失败。", result.error === "missing" ? "scope" : "storage");
  return message;
}

export { listReadingComments, listReadingDiscussions, listDiscussionMessages };
