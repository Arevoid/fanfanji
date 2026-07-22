import type { MemoryItem } from "../../types";

/** Preserves the legacy keyword-overlap and timestamp ranking exactly. */
export function retrieveRelevantMemories(
  memories: readonly MemoryItem[],
  characterId: string,
  userQuery: string,
  topK: number = 5,
): MemoryItem[] {
  const characterMemories = memories.filter((memory) => memory.characterId === characterId);
  if (characterMemories.length === 0) return [];

  if (!userQuery.trim()) return characterMemories.slice(0, topK);

  const queryWords = userQuery.toLowerCase().split(/[\s,.:;!?"'，（）()，。！“”]/).filter((word) => word.length > 0);
  const scored = characterMemories.map((memory) => {
    let score = 0;
    const contentLower = memory.content.toLowerCase();
    queryWords.forEach((word) => {
      if (contentLower.includes(word)) score += word.length;
    });
    score += memory.timestamp * 0.00000000001;
    return { memory, score };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored.slice(0, topK).map(({ memory }) => memory);
}
