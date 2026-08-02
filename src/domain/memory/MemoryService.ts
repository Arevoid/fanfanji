import type { MemoryItem } from "../../types";
import { isDuplicateMemory, isDuplicateMemoryMarker } from "./MemoryDeduplicator";
import { extractMemories } from "./MemoryExtractor";
import { retrieveRelevantMemories } from "./MemoryRetriever";
import { formatDelicateMemoryDiary, formatExtractedMemorySummary, formatMemoriesForPrompt } from "./memoryFormatter";
import type { MemoryExtractionApi, MemoryExtractionContext, MemoryRetrievalContext } from "./memoryTypes";

export { formatDelicateMemoryDiary, formatExtractedMemorySummary, formatMemoriesForPrompt };
export type { MemoryScenario, MemoryExtractionContext, MemoryRetrievalContext } from "./memoryTypes";

export const MemoryService = {
  retrieveRelevantMemories(context: MemoryRetrievalContext): MemoryItem[] {
    return retrieveRelevantMemories(context.existingMemories, context.characterId, context.queryText, context.limit, context.relationId);
  },
  formatMemoriesForPrompt,
  extractMemories(context: MemoryExtractionContext, extractApi: MemoryExtractionApi) {
    return extractMemories(context, extractApi);
  },
  summarizeConversation(context: MemoryExtractionContext, extractApi: MemoryExtractionApi) {
    return extractMemories(context, extractApi);
  },
  deduplicateMemories(existingMemories: readonly MemoryItem[], candidate: Pick<MemoryItem, "characterId" | "relationId" | "content">): boolean {
    return isDuplicateMemory(existingMemories, candidate);
  },
  mergeMemories(existingMemories: readonly MemoryItem[], additions: readonly MemoryItem[]): MemoryItem[] {
    return additions.reduce<MemoryItem[]>((merged, addition) => [addition, ...merged], [...existingMemories]);
  },
  prepareMemoriesForScenario(context: MemoryRetrievalContext): MemoryItem[] {
    return this.retrieveRelevantMemories(context);
  },
  hasMarker(existingMemories: readonly MemoryItem[], characterId: string, relationOrMarker: string | undefined, marker?: string): boolean {
    // Keep the legacy three-argument public call compatible while allowing a
    // relation-aware fourth argument for all new direct-chat callers.
    return marker === undefined
      ? isDuplicateMemoryMarker(existingMemories, characterId, undefined, relationOrMarker || "")
      : isDuplicateMemoryMarker(existingMemories, characterId, relationOrMarker, marker);
  },
};
