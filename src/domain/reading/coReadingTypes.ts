import type { ReadingRoomScope, ParagraphAnchor } from "./types";

export const CO_READING_STORE_VERSION = 1 as const;

export type ReadingRoomStatus = "invited" | "active" | "paused" | "ended" | "declined";
export type ReadingInvitationDecision = "accept" | "hesitate" | "decline";
export type AiReadingPace = "slow" | "normal" | "fast" | "persona_driven";
export type AutonomousCommentFrequency = "off" | "rare" | "moderate" | "active";
export type SpoilerPolicy = "strict" | "shared_fragment_only" | "allow_user_spoilers";

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

export interface CoReadingStore {
  version: typeof CO_READING_STORE_VERSION;
  rooms: ReadingRoom[];
  aiReadingStates: AiReadingState[];
}

export const createEmptyCoReadingStore = (): CoReadingStore => ({
  version: CO_READING_STORE_VERSION,
  rooms: [],
  aiReadingStates: [],
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
