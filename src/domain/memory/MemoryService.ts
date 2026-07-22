import type { MemoryItem } from "../../types";
import { isDuplicateMemory, isDuplicateMemoryMarker } from "./MemoryDeduplicator";
import { extractMemories } from "./MemoryExtractor";
import { retrieveRelevantMemories } from "./MemoryRetriever";
import { formatExtractedMemorySummary, formatMemoriesForPrompt } from "./memoryFormatter";
import type { MemoryExtractionApi, MemoryExtractionContext, MemoryRetrievalContext } from "./memoryTypes";

export { formatExtractedMemorySummary, formatMemoriesForPrompt };
export type { MemoryScenario, MemoryExtractionContext, MemoryRetrievalContext } from "./memoryTypes";

export const MemoryService = {
  retrieveRelevantMemories(context: MemoryRetrievalContext): MemoryItem[] {
    return retrieveRelevantMemories(context.existingMemories, context.characterId, context.queryText, context.limit);
  },
  formatMemoriesForPrompt,
  extractMemories(context: MemoryExtractionContext, extractApi: MemoryExtractionApi) {
    return extractMemories(context, extractApi);
  },
  summarizeConversation(context: MemoryExtractionContext, extractApi: MemoryExtractionApi) {
    return extractMemories(context, extractApi);
  },
  deduplicateMemories(existingMemories: readonly MemoryItem[], candidate: Pick<MemoryItem, "characterId" | "content">): boolean {
    return isDuplicateMemory(existingMemories, candidate);
  },
  mergeMemories(existingMemories: readonly MemoryItem[], additions: readonly MemoryItem[]): MemoryItem[] {
    return additions.reduce<MemoryItem[]>((merged, addition) => [addition, ...merged], [...existingMemories]);
  },
  prepareMemoriesForScenario(context: MemoryRetrievalContext): MemoryItem[] {
    return this.retrieveRelevantMemories(context);
  },
  hasMarker(existingMemories: readonly MemoryItem[], characterId: string, marker: string): boolean {
    return isDuplicateMemoryMarker(existingMemories, characterId, marker);
  },
};
