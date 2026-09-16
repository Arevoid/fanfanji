import type { WorldBookEntry } from "../../types";
import { buildSemanticVector, cosineSimilarity, tokenizeMemoryText } from "../memory/semanticVector";

/** Similarity cutoff tuned for the deterministic local vector fallback. */
export const WORLD_BOOK_VECTOR_MATCH_THRESHOLD = 0.3;
export const WORLD_BOOK_VECTOR_RESULT_LIMIT = 8;

export interface WorldBookVectorCandidate {
  entry: WorldBookEntry;
  score: number;
}

export function rankWorldBookVectorEntries(
  queryText: string,
  entries: readonly WorldBookEntry[],
  limit = WORLD_BOOK_VECTOR_RESULT_LIMIT,
  threshold = WORLD_BOOK_VECTOR_MATCH_THRESHOLD,
): WorldBookVectorCandidate[] {
  const queryVector = buildSemanticVector(queryText);
  const queryTokens = new Set(tokenizeMemoryText(queryText));
  return entries
    .map((entry) => {
      const entryText = `${entry.title}\n${entry.keywords || ""}\n${entry.content}`;
      const entryTokens = new Set(tokenizeMemoryText(entryText));
      const overlap = [...queryTokens].filter((token) => entryTokens.has(token)).length;
      const lexicalBoost = overlap / Math.max(1, Math.min(queryTokens.size, entryTokens.size));
      return {
        entry,
        // Cosine similarity provides the semantic signal; the small token
        // overlap boost stabilizes short Chinese queries where hashing alone
        // can under-weight a meaningful shared bigram.
        score: cosineSimilarity(queryVector, buildSemanticVector(entryText)) + lexicalBoost * 0.5,
      };
    })
    .filter((candidate) => candidate.score >= threshold)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
    .slice(0, Math.max(1, limit));
}
