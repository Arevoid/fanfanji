import type { MemoryItem, OfflineStory } from "../../../types";
import { getOfflineStorySummaryMarker, hasOfflineStorySummary, isOfflineStoryHandoffMemory } from "../../../domain/memory/offlineMemorySync";

const UNINFORMATIVE_SUMMARY = "双方有过线下互动；具体动作、场景和演出对白不作为线上记忆";

export interface OfflineStoryMemoryRepairNeeds {
  legacyHandoff: boolean;
  missingSummary: boolean;
  uninformativeSummary: boolean;
}

/** Pure repair policy shared by the offline workspace and memory-sync boundary. */
export function getOfflineStoryMemoryRepairNeeds(
  story: OfflineStory,
  memories: readonly MemoryItem[],
): OfflineStoryMemoryRepairNeeds {
  const summaryMarker = getOfflineStorySummaryMarker(story);
  const handoffMemories = memories.filter((memory) => isOfflineStoryHandoffMemory(memory, story));
  return {
    legacyHandoff: handoffMemories.some((memory) => !memory.content.includes(summaryMarker)),
    missingSummary: Boolean(story.archivedAt || story.memorySyncStatus === "synced") && !hasOfflineStorySummary(story, memories),
    uninformativeSummary: handoffMemories.some((memory) =>
      memory.content.includes(summaryMarker) && memory.content.includes(UNINFORMATIVE_SUMMARY),
    ),
  };
}
