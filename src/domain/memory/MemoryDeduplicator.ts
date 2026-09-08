import type { MemoryItem } from "../../types";

const normalizeForLegacyDeduplication = (content: string): string => content.toLowerCase().replace(/[\s,.:;!?"']/g, "");

/** Matches the pre-refactor extraction and immediate-summary duplicate rule. */
export function isDuplicateMemory(existingMemories: readonly MemoryItem[], candidate: Pick<MemoryItem, "characterId" | "relationId" | "content">): boolean {
  const normalizedCandidate = normalizeForLegacyDeduplication(candidate.content);
  return existingMemories.some((memory) => memory.characterId === candidate.characterId && memory.relationId === candidate.relationId && normalizeForLegacyDeduplication(memory.content) === normalizedCandidate);
}

export function isDuplicateMemoryMarker(existingMemories: readonly MemoryItem[], characterId: string, relationId: string | undefined, marker: string): boolean {
  return existingMemories.some((memory) => memory.characterId === characterId && memory.relationId === relationId && memory.content.includes(marker));
}
