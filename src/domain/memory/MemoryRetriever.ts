import type { MemoryItem } from "../../types";
import {
  DEFAULT_MEMORY_RECALL_CHARACTER_LIMIT,
  selectMemoryItemsWithinBudget,
  type MemoryRecallBudget,
} from "./memoryRecallPolicy";
import { buildSemanticVector, cosineSimilarity, tokenizeMemoryText } from "./semanticVector";

export interface MemoryRetrievalOptions extends Partial<MemoryRecallBudget> {
  relationId?: string;
  userIdentityId?: string;
  conversationId?: string;
  /** Do not spend the recall budget on a legacy mirror already represented by Truth. */
  excludeCanonicalMirrors?: boolean;
  now?: number;
}

export interface RankedMemoryItem {
  memory: MemoryItem;
  score: number;
  matchedTerms: string[];
  /** Deterministic local vector similarity used before any provider-specific embeddings exist. */
  semanticScore: number;
}

const normalize = (text: string): string => text.toLocaleLowerCase().normalize("NFKC").trim();

const recencyScore = (timestamp: number, now: number): number => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  const ageDays = Math.max(0, now - timestamp) / 86_400_000;
  return Math.max(0, 1.5 - Math.min(1.5, ageDays / 30));
};

const sourceScore = (memory: MemoryItem): number => {
  if (memory.sourceKnowledgeClaimIds?.length) return 3;
  if (memory.isManual) return 2;
  return 0;
};

/**
 * Rank only records that belong to the exact character/relationship scope.
 * relationId is intentionally not a wildcard: omitted means legacy records
 * without any relationship assignment, never every relationship.
 */
export function rankRelevantMemories(
  memories: readonly MemoryItem[],
  characterId: string,
  userQuery: string,
  options: MemoryRetrievalOptions = {},
): RankedMemoryItem[] {
  const scoped = memories.filter((memory) =>
    memory.characterId === characterId
    && (options.relationId ? memory.relationId === options.relationId : !memory.relationId),
  ).filter((memory) =>
    (!options.userIdentityId || !memory.userIdentityId || memory.userIdentityId === options.userIdentityId)
    && (!options.conversationId || !memory.conversationId || memory.conversationId === options.conversationId),
  ).filter((memory) => !memory.recallDisabled
  ).filter((memory) => !options.excludeCanonicalMirrors || !memory.sourceKnowledgeClaimIds?.length);
  if (scoped.length === 0) return [];

  const query = normalize(userQuery);
  const terms = tokenizeMemoryText(query);
  const now = options.now ?? Date.now();
  return scoped.map((memory, originalIndex) => {
    const content = normalize(memory.content);
    const matchedTerms = terms.filter((term) => content.includes(term));
    const semanticScore = cosineSimilarity(buildSemanticVector(query), buildSemanticVector(content));
    const phraseMatch = query.length > 1 && content.includes(query) ? 8 : 0;
    const keywordScore = matchedTerms.reduce((sum, term) => sum + (term.length >= 2 ? Math.min(term.length, 8) * 0.7 : 0), 0);
    const importanceScore = (memory.importance ?? 5) * 0.08;
    const score = phraseMatch + keywordScore + semanticScore * 4 + sourceScore(memory) + importanceScore + recencyScore(memory.timestamp, now);
    return { memory, score, matchedTerms, semanticScore, originalIndex };
  }).sort((left, right) =>
    query
      ? right.score - left.score
        || (right.memory.importance ?? 5) - (left.memory.importance ?? 5)
        || right.memory.timestamp - left.memory.timestamp
        || left.memory.id.localeCompare(right.memory.id)
      : left.originalIndex - right.originalIndex,
  );
}

/**
 * Preserves the legacy keyword-overlap and timestamp ranking exactly while
 * keeping relationship-scoped records isolated. An omitted relationId is a
 * legacy/unscoped read and may only see legacy records that are also missing a
 * relationId; it must never act as a wildcard over every relationship.
 */
export function retrieveRelevantMemories(
  memories: readonly MemoryItem[],
  characterId: string,
  userQuery: string,
  topK: number = 5,
  relationId?: string,
  options: Omit<MemoryRetrievalOptions, "relationId"> = {},
): MemoryItem[] {
  const ranked = rankRelevantMemories(memories, characterId, userQuery, { ...options, relationId });
  const maxCharacters = options.maxCharacters ?? DEFAULT_MEMORY_RECALL_CHARACTER_LIMIT;
  return selectMemoryItemsWithinBudget(ranked.map(({ memory }) => memory), { maxItems: topK, maxCharacters });
}

export function retrieveRelevantMemoriesForScopes(
  memories: readonly MemoryItem[],
  scopes: readonly { characterId: string; relationId: string; userIdentityId?: string }[],
  userQuery: string,
  topK = 5,
  options: Omit<MemoryRetrievalOptions, "relationId"> = {},
): MemoryItem[] {
  const ranked = scopes.flatMap((scope) => rankRelevantMemories(memories, scope.characterId, userQuery, {
    ...options,
    relationId: scope.relationId,
    userIdentityId: scope.userIdentityId,
  }));
  const unique = Array.from(new Map(ranked.map((candidate) => [candidate.memory.id, candidate])).values())
    .sort((left, right) =>
      right.score - left.score
      || right.memory.timestamp - left.memory.timestamp
      || left.memory.id.localeCompare(right.memory.id),
    );
  const maxCharacters = options.maxCharacters ?? DEFAULT_MEMORY_RECALL_CHARACTER_LIMIT;
  return selectMemoryItemsWithinBudget(unique.map(({ memory }) => memory), { maxItems: topK, maxCharacters });
}
