import { getOfflineTimelineStoriesBetween } from "./offlineHandoffPromptContext";
import type { OfflineStory } from "../../../types";
type Input = Parameters<typeof getOfflineTimelineStoriesBetween>[0];
const time = (story: OfflineStory) => story.onlineHandoff?.endedAt ?? story.archivedAt ?? story.lastMemorySyncAt ?? story.updatedAt;
/** Prepare canonical-summary eligibility once, then resolve each bubble by range. */
export function createOfflineTimelineLookup(input: Omit<Input, "previousAt" | "currentAt">) {
  const stories = getOfflineTimelineStoriesBetween({ ...input, previousAt: -Infinity, currentAt: Infinity });
  const upper = (at: number) => { let low = 0, high = stories.length; while (low < high) { const mid = (low + high) >>> 1;
    if (time(stories[mid]) <= at) low = mid + 1; else high = mid; } return low; };
  return (previousAt: number | undefined, currentAt: number): OfflineStory[] => !previousAt ? [] : stories.slice(upper(previousAt), upper(currentAt));
}
