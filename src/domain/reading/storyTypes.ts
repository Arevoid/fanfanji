export const READING_STORY_STORE_VERSION = 1 as const;

export type ReadingStoryLength = "short" | "medium" | "long";
export type ReadingStoryStatus = "active" | "completed" | "paused" | "abandoned";
export type ReadingStoryEntryMode = "soul_wear" | "body_wear";

export interface ReadingStoryScope {
  userIdentityId: string;
  storyId: string;
}

export interface ReadingStoryChoice {
  id: string;
  label: string;
  consequenceHint?: string;
}

export interface ReadingStoryState extends ReadingStoryScope {
  bookId?: string;
  title: string;
  entryMode: ReadingStoryEntryMode;
  status: ReadingStoryStatus;
  length: ReadingStoryLength;
  targetChapters: number;
  currentChapter: number;
  currentLocation: string;
  currentTime: string;
  characterName: string;
  characterRole?: string;
  goals: string[];
  discoveredIntel: string[];
  tasks: string[];
  relationships: Record<string, number>;
  inventory: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ReadingStoryTurn extends ReadingStoryScope {
  id: string;
  turnIndex: number;
  parentTurnId?: string;
  narrative: string;
  dialogue: Array<{ speaker: string; text: string }>;
  choices: ReadingStoryChoice[];
  userAction?: string;
  stateChanges: string[];
  discoveredIntel: string[];
  taskChanges: string[];
  relationshipChanges: string[];
  currentLocation: string;
  currentTime: string;
  chapterProgress: number;
  shouldEndChapter: boolean;
  createdAt: number;
}

export interface ReadingStorySave extends ReadingStoryScope {
  id: string;
  turnId: string;
  label: string;
  state: ReadingStoryState;
  createdAt: number;
}

export interface ReadingStoryStore {
  version: typeof READING_STORY_STORE_VERSION;
  stories: ReadingStoryState[];
  turns: ReadingStoryTurn[];
  saves: ReadingStorySave[];
}

export const createEmptyReadingStoryStore = (): ReadingStoryStore => ({ version: READING_STORY_STORE_VERSION, stories: [], turns: [], saves: [] });
