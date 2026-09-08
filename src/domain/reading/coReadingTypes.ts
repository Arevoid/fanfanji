import type { ReadingRoomScope, ParagraphAnchor } from "./types";

export const CO_READING_STORE_VERSION = 1 as const;

export type ReadingRoomStatus = "invited" | "active" | "paused" | "ended" | "declined";
export type ReadingInvitationDecision = "accept" | "hesitate" | "decline";
export type AiReadingPace = "slow" | "normal" | "fast" | "persona_driven";
export type AutonomousCommentFrequency = "off" | "rare" | "moderate" | "active";
export type SpoilerPolicy = "strict" | "shared_fragment_only" | "allow_user_spoilers";
export type ReadingCommentKind = "paragraph" | "chapter" | "book" | "reply";
export type ReadingCommentAuthor = "user" | "ai";
export type ReadingCommentSource = "known" | "user_revealed";
export type ReadingDiscussionStatus = "open" | "pending_ai" | "closed";

export interface ReadingRoomCharacterSnapshot {
  characterId: string;
  name: string;
  avatar?: string;
}

export interface ReadingRoomSettings {
  sharePreciseProgress: boolean;
  allowSummon: boolean;
  allowUnreadParagraphPreview: boolean;
  spoilerPolicy: SpoilerPolicy;
}

export interface ReadingRoom extends ReadingRoomScope {
  id: string;
  status: ReadingRoomStatus;
  characterSnapshot: ReadingRoomCharacterSnapshot;
  settings: ReadingRoomSettings;
  invitationDecision?: ReadingInvitationDecision;
  invitationReplyText?: string;
  invitedAt: number;
  respondedAt?: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AiReadingParagraphRange {
  start: number;
  end: number;
}

export interface AiReadingSpoilerDisclosure {
  id: string;
  chapterId: string;
  paragraphAnchorId: string;
  textSnapshot: string;
  disclosedAt: number;
}

export interface AiReadingState extends ReadingRoomScope {
  aiReadingCursor: ParagraphAnchor | null;
  aiKnownChapterIds: string[];
  aiKnownParagraphRange: Record<string, AiReadingParagraphRange>;
  aiReadingPace: AiReadingPace;
  lastCommentedAnchor?: ParagraphAnchor;
  autonomousCommentFrequency: AutonomousCommentFrequency;
  spoilerPolicy: SpoilerPolicy;
  userRevealedSpoilers: AiReadingSpoilerDisclosure[];
  updatedAt: number;
}

export interface ReadingComment extends ReadingRoomScope {
  id: string;
  kind: ReadingCommentKind;
  author: ReadingCommentAuthor;
  authorName: string;
  targetChapterId?: string;
  targetParagraphAnchorId?: string;
  parentCommentId?: string;
  textSnapshot?: string;
  body: string;
  source: ReadingCommentSource;
  isSpoiler: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingDiscussion extends ReadingRoomScope {
  id: string;
  status: ReadingDiscussionStatus;
  targetChapterId?: string;
  targetParagraphAnchorId?: string;
  frozenFragment?: string;
  userPrompt: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingDiscussionMessage extends ReadingRoomScope {
  id: string;
  discussionId: string;
  author: ReadingCommentAuthor;
  authorName: string;
  body: string;
  source: ReadingCommentSource;
  createdAt: number;
}

export interface ReadingRoomProgress extends ReadingRoomScope {
  chapterId: string;
  paragraphAnchorId: string;
  characterOffset: number;
  scrollOffsetHint?: number;
  percent: number;
  updatedAt: number;
}

export interface CoReadingStore {
  version: typeof CO_READING_STORE_VERSION;
  rooms: ReadingRoom[];
  aiReadingStates: AiReadingState[];
  comments: ReadingComment[];
  discussions: ReadingDiscussion[];
  discussionMessages: ReadingDiscussionMessage[];
  roomProgress: ReadingRoomProgress[];
}

export const createEmptyCoReadingStore = (): CoReadingStore => ({
  version: CO_READING_STORE_VERSION,
  rooms: [],
  aiReadingStates: [],
  comments: [],
  discussions: [],
  discussionMessages: [],
  roomProgress: [],
});

export const DEFAULT_READING_ROOM_SETTINGS: ReadingRoomSettings = {
  sharePreciseProgress: false,
  allowSummon: true,
  allowUnreadParagraphPreview: false,
  spoilerPolicy: "strict",
};

export const DEFAULT_AI_READING_STATE = {
  aiReadingPace: "persona_driven" as const,
  autonomousCommentFrequency: "moderate" as const,
  spoilerPolicy: "strict" as const,
};
