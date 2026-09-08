import type { ReadingStoryStatus } from "./storyTypes";

/**
 * `currentChapter` stores the number of chapters already completed so that
 * the first opening can remain at zero internally. The UI and prompts should
 * show the chapter currently being played, which is one-based.
 */
export function getReadingStoryChapterNumber(input: {
  currentChapter: number;
  targetChapters: number;
  status?: ReadingStoryStatus;
}): number {
  const target = Math.max(1, Math.floor(input.targetChapters) || 1);
  if (input.status === "completed") return target;
  return Math.min(target, Math.max(1, Math.floor(input.currentChapter) + 1));
}

/** Calculate a progress-bar value from completed chapters plus the active chapter progress. */
export function getReadingStoryProgress(input: {
  currentChapter: number;
  targetChapters: number;
  chapterProgress?: number;
  status?: ReadingStoryStatus;
}): number {
  if (input.status === "completed") return 1;
  const target = Math.max(1, Math.floor(input.targetChapters) || 1);
  const withinChapter = Math.min(1, Math.max(0, Number(input.chapterProgress) || 0));
  return Math.min(1, Math.max(0, (Math.max(0, input.currentChapter) + withinChapter) / target));
}
