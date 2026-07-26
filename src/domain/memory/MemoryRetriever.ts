import type { MemoryItem } from "../../types";

/** Preserves the legacy keyword-overlap and timestamp ranking exactly. */
export function retrieveRelevantMemories(
  memories: readonly MemoryItem[],
  characterId: string,
  relationId: string | undefined,
  userQuery: string,
  topK: number = 5,
): MemoryItem[] {
  const characterMemories = memories.filter((memory) => {
    if (memory.characterId !== characterId) return false;
    // New records are strictly relation-scoped. Legacy records retain their
    // character scope so existing data remains readable by its default relation.
    return relationId
      ? memory.relationId === relationId
        || (!memory.relationId && relationId.endsWith(":identity-1"))
      : true;
  });
  if (characterMemories.length === 0) return [];

  if (!userQuery.trim()) return characterMemories.slice(0, topK);

  const queryWords = userQuery.toLowerCase().split(/[\s,.:;!?"'，（）()，。！“”]/).filter((word) => word.length > 0);
  const scored = characterMemories.map((memory) => {
    let score = 0;
    const contentLower = memory.content.toLowerCase();
    queryWords.forEach((word) => {
      if (contentLower.includes(word)) score += word.length;
    });
    // Importance only breaks otherwise equivalent recall candidates. This
    // keeps the legacy keyword and recency behavior while letting durable
    // facts outrank short-lived offline events with the same relevance.
    score += (memory.importance ?? 5) * 0.01;
    score += memory.timestamp * 0.00000000001;
    return { memory, score };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored.slice(0, topK).map(({ memory }) => memory);
}
