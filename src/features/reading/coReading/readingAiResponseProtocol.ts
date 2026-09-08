import type { MemoryItem } from "../../../types";
import type { ReadingRoom, ReadingCommentKind } from "../../../domain/reading/coReadingTypes";
import type { ReadingRoomScope } from "../../../domain/reading/types";
import type { AiReadingContextProjection } from "./aiReadingBoundary";

export type ReadingAiResponseKind = "comment" | "discussion_reply" | "invitation_reply";

export interface ReadingAiMemoryCandidate {
  candidateId: string;
  content: string;
  importance?: number;
  sourceCommentId?: string;
  targetChapterId?: string;
  targetParagraphAnchorId?: string;
}

export interface ReadingAiResponse {
  kind: ReadingAiResponseKind;
  body: string;
  targetParagraphAnchorId?: string;
  source: "known" | "user_revealed";
  isSpoiler: boolean;
  memoryCandidate?: ReadingAiMemoryCandidate;
}

export interface ReadingMemoryCandidate extends ReadingAiMemoryCandidate {
  scope: ReadingRoomScope;
  bookId: string;
  createdAt: number;
}

export type ReadingAiResponseValidation =
  | { ok: true; value: ReadingAiResponse }
  | { ok: false; error: string };

const MAX_BODY_LENGTH = 12000;
const MAX_MEMORY_LENGTH = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isResponseKind(value: unknown): value is ReadingAiResponseKind {
  return value === "comment" || value === "discussion_reply" || value === "invitation_reply";
}

function isSource(value: unknown): value is ReadingAiResponse["source"] {
  return value === "known" || value === "user_revealed";
}

function safeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function knownSourceForAnchor(projection: AiReadingContextProjection, anchorId: string): ReadingAiResponse["source"] | undefined {
  if (projection.knownFragments.some((fragment) => fragment.anchor.id === anchorId)) return "known";
  if (projection.userRevealedSpoilers.some((fragment) => fragment.anchor.id === anchorId)) return "user_revealed";
  return undefined;
}

function validateMemoryCandidate(raw: unknown, response: ReadingAiResponse): ReadingAiMemoryCandidate | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error("memoryCandidate 必须是对象");
  const candidateId = safeText(raw.candidateId);
  const content = safeText(raw.content);
  if (!candidateId || candidateId.length > 200) throw new Error("memoryCandidate.candidateId 无效");
  if (!content || content.length > MAX_MEMORY_LENGTH) throw new Error("memoryCandidate.content 无效或过长");
  const importance = raw.importance === undefined ? undefined : Number(raw.importance);
  if (importance !== undefined && (!Number.isFinite(importance) || importance < 1 || importance > 10)) throw new Error("memoryCandidate.importance 必须在 1-10 之间");
  const targetParagraphAnchorId = safeText(raw.targetParagraphAnchorId);
  if (targetParagraphAnchorId && response.targetParagraphAnchorId && targetParagraphAnchorId !== response.targetParagraphAnchorId) throw new Error("记忆候选锚点必须与回复目标一致");
  return {
    candidateId,
    content,
    ...(importance === undefined ? {} : { importance }),
    ...(safeText(raw.sourceCommentId) ? { sourceCommentId: safeText(raw.sourceCommentId) } : {}),
    ...(safeText(raw.targetChapterId) ? { targetChapterId: safeText(raw.targetChapterId) } : {}),
    ...(targetParagraphAnchorId ? { targetParagraphAnchorId } : {}),
  };
}

/** Validates and scope-checks an untrusted model response before persistence. */
export function validateReadingAiResponse(
  raw: unknown,
  input: { scope: ReadingRoomScope; projection: AiReadingContextProjection; kind?: ReadingAiResponseKind },
): ReadingAiResponseValidation {
  try {
    if (!isRecord(raw)) throw new Error("AI 回复必须是对象");
    const kind = raw.kind;
    if (!isResponseKind(kind) || (input.kind && kind !== input.kind)) throw new Error("AI 回复 kind 无效");
    const body = safeText(raw.body);
    if (!body || body.length > MAX_BODY_LENGTH) throw new Error("AI 回复正文无效或过长");
    const source = raw.source;
    if (!isSource(source)) throw new Error("AI 回复 source 无效");
    if (typeof raw.isSpoiler !== "boolean") throw new Error("AI 回复 isSpoiler 必须是布尔值");
    const targetParagraphAnchorId = safeText(raw.targetParagraphAnchorId);
    if (targetParagraphAnchorId) {
      const allowedSource = knownSourceForAnchor(input.projection, targetParagraphAnchorId);
      if (!allowedSource) throw new Error("AI 回复引用了未知或未读段落");
      if (allowedSource !== source) throw new Error("AI 回复 source 与段落知识边界不一致");
    }
    if (source === "user_revealed" && !targetParagraphAnchorId) throw new Error("主动透露内容必须绑定目标段落");
    const memoryCandidate = validateMemoryCandidate(raw.memoryCandidate, {
      kind,
      body,
      ...(targetParagraphAnchorId ? { targetParagraphAnchorId } : {}),
      source,
      isSpoiler: raw.isSpoiler,
    });
    return { ok: true, value: { kind, body, ...(targetParagraphAnchorId ? { targetParagraphAnchorId } : {}), source, isSpoiler: raw.isSpoiler, ...(memoryCandidate ? { memoryCandidate } : {}) } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AI 回复校验失败" };
  }
}

/** Converts a validated response into a relation-bound, unpersisted candidate. */
export function buildReadingMemoryCandidate(input: { response: ReadingAiResponse; room: ReadingRoom; bookId: string; now?: number }): ReadingMemoryCandidate | undefined {
  const candidate = input.response.memoryCandidate;
  if (!candidate) return undefined;
  return { ...candidate, scope: { userIdentityId: input.room.userIdentityId, bookId: input.bookId, readingRoomId: input.room.readingRoomId, relationId: input.room.relationId, characterId: input.room.characterId, conversationId: input.room.conversationId }, bookId: input.bookId, createdAt: input.now ?? Date.now() };
}

/** Explicit user confirmation is required before this becomes a MemoryItem. */
export function confirmReadingMemoryCandidate(candidate: ReadingMemoryCandidate, now = Date.now()): MemoryItem {
  return {
    id: `reading-memory-${candidate.candidateId}`,
    characterId: candidate.scope.characterId,
    relationId: candidate.scope.relationId,
    content: candidate.content,
    timestamp: now,
    importance: candidate.importance ?? 5,
    isManual: true,
    sourceReadingRoomId: candidate.scope.readingRoomId,
    ...(candidate.sourceCommentId ? { sourceReadingCommentId: candidate.sourceCommentId } : {}),
    sourceReadingEvidence: {
      bookId: candidate.bookId,
      ...(candidate.targetChapterId ? { chapterId: candidate.targetChapterId } : {}),
      ...(candidate.targetParagraphAnchorId ? { paragraphAnchorId: candidate.targetParagraphAnchorId } : {}),
    },
  };
}

export function readingCommentKindForResponse(kind: ReadingAiResponseKind): ReadingCommentKind {
  return kind === "comment" ? "paragraph" : "reply";
}
