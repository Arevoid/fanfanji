export const READING_ANALYSIS_STORE_VERSION = 1 as const;

export type ReadingAnalysisTaskType = "chapter_summary" | "entity_index" | "book_bible";
export type ReadingAnalysisTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type ReadingAnalysisEntityKind = "character" | "location" | "faction" | "event";

export interface ReadingAnalysisScope {
  userIdentityId: string;
  bookId: string;
}

export interface ReadingChapterSummary extends ReadingAnalysisScope {
  id: string;
  chapterId: string;
  chapterOrder: number;
  title: string;
  summary: string;
  keyPoints: string[];
  sourceHash: string;
  analysisVersion: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingAnalysisEntity extends ReadingAnalysisScope {
  id: string;
  kind: ReadingAnalysisEntityKind;
  name: string;
  aliases: string[];
  summary: string;
  chapterIds: string[];
  attributes: Record<string, string>;
  confidence: number;
  analysisVersion: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingAnalysisTask extends ReadingAnalysisScope {
  id: string;
  type: ReadingAnalysisTaskType;
  status: ReadingAnalysisTaskStatus;
  inputVersion: string;
  chapterIds: string[];
  completedChapterIds: string[];
  checkpointIndex: number;
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingBookBible extends ReadingAnalysisScope {
  id: string;
  version: number;
  analysisVersion: string;
  premise: string;
  worldRules: string[];
  storyLines: string[];
  coreCharacterIds: string[];
  keyLocationIds: string[];
  keyFactionIds: string[];
  timeline: string[];
  isUserEdited: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingAnalysisStore {
  version: typeof READING_ANALYSIS_STORE_VERSION;
  tasks: ReadingAnalysisTask[];
  chapterSummaries: ReadingChapterSummary[];
  entities: ReadingAnalysisEntity[];
  bookBibles: ReadingBookBible[];
}

export const createEmptyReadingAnalysisStore = (): ReadingAnalysisStore => ({ version: READING_ANALYSIS_STORE_VERSION, tasks: [], chapterSummaries: [], entities: [], bookBibles: [] });
