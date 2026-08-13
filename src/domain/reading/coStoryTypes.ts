import type { ReadingStoryChoice, ReadingStoryEntryMode, ReadingStoryLength } from "./storyTypes";

export const READING_CO_STORY_STORE_VERSION = 1 as const;

export interface ReadingCoStoryScope {
  userIdentityId: string;
  coStoryId: string;
  relationId: string;
  characterId: string;
}

export type ReadingCoStoryActor = "user" | "ai_friend" | "system";
export type ReadingCoStoryActionMode = "suggest" | "ask_opinion" | "low_risk_execute";
export type ReadingCoStoryActionRisk = "low" | "major";

export interface ReadingWorldDefinition {
  genre: string;
  worldView: string;
  synopsis: string;
  intendedEnding?: string;
}

export interface ReadingStoryAiFriendProfile {
  relationId: string;
  characterId: string;
  displayName: string;
  characterName: string;
  characterRole?: string;
  entryMode?: ReadingStoryEntryMode;
  originalCharacterId?: string;
  personaSummary: string;
  knownIntel: string[];
  knownTurnIds: string[];
}

export interface ReadingCoStoryState extends ReadingCoStoryScope {
  universeStoryId?: string;
  origin?: "book" | "custom";
  worldDefinition?: ReadingWorldDefinition;
  title: string;
  length: ReadingStoryLength;
  status: "active" | "completed" | "paused";
  currentChapter: number;
  targetChapters: number;
  currentLocation: string;
  currentTime: string;
  userCharacterName: string;
  userCharacterRole?: string;
  userEntryMode?: ReadingStoryEntryMode;
  userOriginalCharacterId?: string;
  userGoals: string[];
  aiFriend: ReadingStoryAiFriendProfile;
  activeActor: "user" | "ai_friend";
  pendingApproval?: ReadingCoStoryPendingApproval;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingCoStoryPendingApproval {
  actionId: string;
  actor: "ai_friend";
  action: string;
  reason: string;
  risk: "major";
  createdAt: number;
}

export interface ReadingCoStoryTurn extends ReadingCoStoryScope {
  turnId: string;
  turnIndex: number;
  actor: ReadingCoStoryActor;
  actionMode?: ReadingCoStoryActionMode;
  action?: string;
  /** User and AI actions share the same persisted turn stream. */
  userAction?: string;
  aiAction?: string;
  perspective: "user" | "ai_friend" | "shared";
  narrative: string;
  dialogue: Array<{ speaker: string; text: string }>;
  choices: ReadingStoryChoice[];
  risk: ReadingCoStoryActionRisk;
  requiresUserApproval: boolean;
  visibleTo: Array<"user" | "ai_friend">;
  createdAt: number;
}

export interface ReadingStoryAiActionResult {
  action: string;
  rationale: string;
  risk: ReadingCoStoryActionRisk;
  requiresUserApproval: boolean;
  controlsUserCharacter: boolean;
}

export interface ReadingCoStoryStore {
  version: typeof READING_CO_STORY_STORE_VERSION;
  stories: ReadingCoStoryState[];
  turns: ReadingCoStoryTurn[];
}

export const createEmptyReadingCoStoryStore = (): ReadingCoStoryStore => ({ version: READING_CO_STORY_STORE_VERSION, stories: [], turns: [] });
