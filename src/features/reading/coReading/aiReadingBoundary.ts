import { loadReadingStore } from "../../../core/storage/repositories/readingRepository";
import { getAiReadingState, getReadingRoom, saveAiReadingState } from "../../../core/storage/repositories/readingCoReadingRepository";
import type { AiReadingPace, AiReadingSpoilerDisclosure, AutonomousCommentFrequency, SpoilerPolicy, AiReadingState } from "../../../domain/reading/coReadingTypes";
import type { ParagraphAnchor, ReadingRoomScope } from "../../../domain/reading/types";

const createId = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export class AiReadingBoundaryError extends Error {
  constructor(message: string, public readonly code: "missing-room" | "missing-anchor" | "invalid-scope" | "storage" = "storage") {
    super(message);
    this.name = "AiReadingBoundaryError";
  }
}

export interface AiReadingFragment { anchor: ParagraphAnchor; textSnapshot: string; }
export interface AiReadingContextProjection {
  scope: ReadingRoomScope;
  aiReadingPace: AiReadingPace;
  spoilerPolicy: SpoilerPolicy;
  knownFragments: AiReadingFragment[];
  userRevealedSpoilers: AiReadingFragment[];
  blockedAnchorIds: string[];
}
interface OrderedAnchor extends ParagraphAnchor { chapterOrder: number; }

function requireState(scope: ReadingRoomScope): AiReadingState {
  const room = getReadingRoom(scope);
  const state = getAiReadingState(scope);
  if (!room || !state) throw new AiReadingBoundaryError("共读房间或 AI 阅读状态不存在。", "missing-room");
  return state;
}

function getOrderedAnchors(scope: ReadingRoomScope): OrderedAnchor[] {
  const store = loadReadingStore().value;
  const chapterOrder = new Map(store.chapters.filter((chapter) => chapter.userIdentityId === scope.userIdentityId && chapter.bookId === scope.bookId).map((chapter) => [chapter.id, chapter.order]));
  return store.paragraphAnchors
    .filter((anchor) => anchor.userIdentityId === scope.userIdentityId && anchor.bookId === scope.bookId && chapterOrder.has(anchor.chapterId))
    .map((anchor) => ({ ...anchor, chapterOrder: chapterOrder.get(anchor.chapterId) as number }))
    .sort((left, right) => left.chapterOrder - right.chapterOrder || left.ordinal - right.ordinal);
}

function persist(state: AiReadingState): AiReadingState {
  const result = saveAiReadingState(state);
  if (!result.success) throw new AiReadingBoundaryError("AI 阅读状态保存失败。", "storage");
  return state;
}

export function setAiReadingPreferences(input: { scope: ReadingRoomScope; pace?: AiReadingPace; autonomousCommentFrequency?: AutonomousCommentFrequency; spoilerPolicy?: SpoilerPolicy; now?: number }): AiReadingState {
  const state = requireState(input.scope);
  return persist({ ...state, aiReadingPace: input.pace ?? state.aiReadingPace, autonomousCommentFrequency: input.autonomousCommentFrequency ?? state.autonomousCommentFrequency, spoilerPolicy: input.spoilerPolicy ?? state.spoilerPolicy, updatedAt: input.now ?? Date.now() });
}

/** Advances monotonically to a real paragraph in this identity's local book. */
export function advanceAiReadingToParagraph(input: { scope: ReadingRoomScope; paragraphAnchorId: string; now?: number }): AiReadingState {
  const state = requireState(input.scope);
  const anchors = getOrderedAnchors(input.scope);
  const targetIndex = anchors.findIndex((anchor) => anchor.id === input.paragraphAnchorId);
  if (targetIndex < 0) throw new AiReadingBoundaryError("目标段落不属于当前身份的这本书。", "missing-anchor");
  const currentIndex = state.aiReadingCursor ? anchors.findIndex((anchor) => anchor.id === state.aiReadingCursor?.id) : -1;
  if (currentIndex >= targetIndex) return state;
  const ranges = { ...state.aiKnownParagraphRange };
  const knownChapterIds = new Set(state.aiKnownChapterIds);
  for (const anchor of anchors.slice(0, targetIndex + 1)) {
    knownChapterIds.add(anchor.chapterId);
    const previous = ranges[anchor.chapterId];
    ranges[anchor.chapterId] = { start: previous?.start ?? anchor.ordinal, end: Math.max(previous?.end ?? anchor.ordinal, anchor.ordinal) };
  }
  const target = anchors[targetIndex];
  return persist({ ...state, aiReadingCursor: target, aiKnownChapterIds: Array.from(knownChapterIds), aiKnownParagraphRange: ranges, updatedAt: input.now ?? Date.now() });
}

export function isAiParagraphKnown(scope: ReadingRoomScope, paragraphAnchorId: string): boolean {
  const state = requireState(scope);
  const anchor = getOrderedAnchors(scope).find((candidate) => candidate.id === paragraphAnchorId);
  if (!anchor) return false;
  const range = state.aiKnownParagraphRange[anchor.chapterId];
  return Boolean(range && state.aiKnownChapterIds.includes(anchor.chapterId) && anchor.ordinal >= range.start && anchor.ordinal <= range.end);
}

/** Records an explicit user disclosure without moving the AI's normal reading cursor. */
export function recordUserRevealedSpoiler(input: { scope: ReadingRoomScope; paragraphAnchorId: string; textSnapshot: string; now?: number }): AiReadingState {
  const state = requireState(input.scope);
  const anchor = getOrderedAnchors(input.scope).find((candidate) => candidate.id === input.paragraphAnchorId);
  if (!anchor) throw new AiReadingBoundaryError("剧透片段不属于当前身份的这本书。", "missing-anchor");
  const textSnapshot = input.textSnapshot.trim();
  if (!textSnapshot || textSnapshot.length > 8000) throw new AiReadingBoundaryError("主动分享的片段不能为空或超过 8000 字。", "invalid-scope");
  const disclosures = state.userRevealedSpoilers || [];
  if (disclosures.some((item) => item.paragraphAnchorId === anchor.id && item.textSnapshot === textSnapshot)) return state;
  const disclosure: AiReadingSpoilerDisclosure = { id: createId("user-revealed-spoiler"), chapterId: anchor.chapterId, paragraphAnchorId: anchor.id, textSnapshot, disclosedAt: input.now ?? Date.now() };
  return persist({ ...state, userRevealedSpoilers: [...disclosures, disclosure], updatedAt: input.now ?? Date.now() });
}

/** Projects only known paragraphs plus explicitly disclosed frozen fragments. */
export function buildAiReadingContext(scope: ReadingRoomScope, fragments: readonly AiReadingFragment[]): AiReadingContextProjection {
  const state = requireState(scope);
  const disclosures = new Map((state.userRevealedSpoilers || []).map((item) => [item.paragraphAnchorId, item]));
  const knownFragments: AiReadingFragment[] = [];
  const userRevealedSpoilers: AiReadingFragment[] = [];
  const blockedAnchorIds: string[] = [];
  for (const fragment of fragments) {
    if (fragment.anchor.userIdentityId !== scope.userIdentityId || fragment.anchor.bookId !== scope.bookId) { blockedAnchorIds.push(fragment.anchor.id); continue; }
    if (isAiParagraphKnown(scope, fragment.anchor.id)) { knownFragments.push(fragment); continue; }
    const disclosure = disclosures.get(fragment.anchor.id);
    if (disclosure && disclosure.textSnapshot === fragment.textSnapshot) { userRevealedSpoilers.push({ anchor: fragment.anchor, textSnapshot: disclosure.textSnapshot }); continue; }
    blockedAnchorIds.push(fragment.anchor.id);
  }
  return { scope, aiReadingPace: state.aiReadingPace, spoilerPolicy: state.spoilerPolicy, knownFragments, userRevealedSpoilers, blockedAnchorIds: Array.from(new Set(blockedAnchorIds)) };
}
