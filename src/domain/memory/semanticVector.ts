/**
 * Provider-independent semantic fallback used by local memory retrieval.
 * It is intentionally deterministic so recall never depends on a second
 * network request or an API key. The same representation is also persisted
 * by the optional IndexedDB vector index.
 */
export const MEMORY_VECTOR_DIMENSIONS = 96;

const normalize = (text: string): string => text.toLocaleLowerCase().normalize("NFKC").trim();

export const tokenizeMemoryText = (text: string): string[] => {
  const normalized = normalize(text);
  const latinTerms = normalized.match(/[a-z0-9]+/gu) || [];
  const cjkRuns = normalized.match(/[\u3400-\u9fff]+/gu) || [];
  const cjkTerms = cjkRuns.flatMap((run) => {
    if (run.length <= 2) return [run];
    const terms = [run];
    for (let index = 0; index < run.length - 1; index += 1) terms.push(run.slice(index, index + 2));
    return terms;
  });
  return Array.from(new Set([...latinTerms, ...cjkTerms].filter((term) => term.length > 0)));
};

const hashToken = (token: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export function buildSemanticVector(text: string): number[] {
  const vector = Array.from({ length: MEMORY_VECTOR_DIMENSIONS }, () => 0);
  tokenizeMemoryText(text).forEach((token) => {
    const hash = hashToken(token);
    const bucket = hash % MEMORY_VECTOR_DIMENSIONS;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[bucket] += sign * Math.min(4, Math.max(1, token.length / 2));
  });
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude > 0 ? vector.map((value) => value / magnitude) : vector;
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) score += left[index] * right[index];
  return Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0;
}
