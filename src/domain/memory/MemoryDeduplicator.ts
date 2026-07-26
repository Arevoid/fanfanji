import type { MemoryItem } from "../../types";

const normalizeForLegacyDeduplication = (content: string): string => content.toLowerCase().replace(/[\s,.:;!?"']/g, "");

/** Matches the pre-refactor extraction and immediate-summary duplicate rule. */
export function isDuplicateMemory(existingMemories: readonly MemoryItem[], candidate: Pick<MemoryItem, "characterId" | "relationId" | "content">): boolean {
  const normalizedCandidate = normalizeForLegacyDeduplication(candidate.content);
  return existingMemories.some((memory) =>
    memory.characterId === candidate.characterId
    && (candidate.relationId
      ? memory.relationId === candidate.relationId
        || (!memory.relationId && candidate.relationId.endsWith(":identity-1"))
      : !memory.relationId)
    && normalizeForLegacyDeduplication(memory.content) === normalizedCandidate,
  );
}

export function isDuplicateMemoryMarker(existingMemories: readonly MemoryItem[], characterId: string, marker: string, relationId?: string): boolean {
  return existingMemories.some((memory) =>
    memory.characterId === characterId
    && (!relationId
      || memory.relationId === relationId
      || (!memory.relationId && relationId.endsWith(":identity-1")))
    && memory.content.includes(marker),
  );
}
