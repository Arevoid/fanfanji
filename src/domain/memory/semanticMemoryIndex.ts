import type { CharacterTruthScope, KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../characterKnowledge/knowledgeConflictPolicy";
import { sourceRevision } from "../characterKnowledge/knowledgeEvolution";

export interface SemanticMemoryEntry { claimId: string; revision: string; vector: number[] }
export interface SemanticMemoryIndex { version: 1; scope: CharacterTruthScope; provider: string; entries: SemanticMemoryEntry[];
  pending?: { claimId: string; revision: string }[]; updatedAt?: number; state?: "ready" | "pending" | "limited" | "failed";
  failureCode?: "authentication" | "rate_limit" | "endpoint" | "timeout" | "invalid_vectors" | "unavailable" }
export function semanticIndexFailure(error: unknown): NonNullable<SemanticMemoryIndex["failureCode"]> {
  const message = error instanceof Error ? error.message : "";
  if (/^embedding_status_(401|403)$/u.test(message)) return "authentication";
  if (message === "embedding_status_429") return "rate_limit";
  if (/^embedding_status_(404|405)$/u.test(message) || message === "invalid_embedding_endpoint") return "endpoint";
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return "timeout";
  if (["invalid_embedding_vectors", "invalid_embedding_response"].includes(message)) return "invalid_vectors";
  return "unavailable";
}
export const SEMANTIC_INDEX_FAILURE_LABELS = { authentication: "密钥无效或无权限", rate_limit: "接口限流", endpoint: "向量地址或接口不支持",
  timeout: "请求超时或中断", invalid_vectors: "接口返回的向量格式无效", unavailable: "接口或网络暂不可用" } as const;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, field]) => [key, canonical(field)]));
  return value;
}
export function semanticClaimRevision(claim: KnowledgeClaim): string {
  return sourceRevision(JSON.stringify([claim.statement, claim.kind, claim.truthStatus, claim.temporalStatus,
    claim.status, claim.validFrom, claim.validTo, claim.supersededById, claim.recallDisabled, canonical(claim.source), canonical(claim.factIdentity), canonical(claim.event)]));
}
export function normalizeEmbeddingVector(input: unknown): number[] | undefined {
  if (!Array.isArray(input) || input.length < 2 || input.length > 4096
    || !input.every((value) => typeof value === "number" && Number.isFinite(value))) return undefined;
  const norm = Math.hypot(...input);
  return norm > 0 && Number.isFinite(norm) ? input.map((value) => value / norm) : undefined;
}
export function isSemanticMemoryIndex(input: unknown, scope: CharacterTruthScope, provider: string): input is SemanticMemoryIndex {
  if (!input || typeof input !== "object") return false;
  const value = input as SemanticMemoryIndex;
  return value.version === 1 && value.provider === provider && Boolean(value.scope) && isExactTruthScope(value.scope, scope)
    && (value.pending === undefined || Array.isArray(value.pending) && value.pending.every((entry) => entry && typeof entry.claimId === "string" && typeof entry.revision === "string"))
    && (value.state === undefined || ["ready", "pending", "limited", "failed"].includes(value.state))
    && (value.failureCode === undefined || Object.hasOwn(SEMANTIC_INDEX_FAILURE_LABELS, value.failureCode))
    && Array.isArray(value.entries) && value.entries.every((entry) => entry && typeof entry.claimId === "string"
      && typeof entry.revision === "string" && Boolean(normalizeEmbeddingVector(entry.vector)));
}
export function scoreSemanticMemories(claims: readonly KnowledgeClaim[], index: SemanticMemoryIndex, queryVector: readonly number[], minimumSimilarity = 0.5) {
  const query = normalizeEmbeddingVector(queryVector);
  const scores = new Map<string, number>();
  if (!query) return scores;
  const current = new Map(claims.filter((claim) => isExactTruthScope(claim, index.scope)).map((claim) => [claim.id, claim]));
  const candidates: { id: string; cosine: number }[] = [];
  for (const entry of index.entries) {
    const claim = current.get(entry.claimId);
    if (!claim || claim.recallDisabled || claim.status !== "active" || entry.revision !== semanticClaimRevision(claim)
      || entry.vector.length !== query.length) continue;
    const vector = normalizeEmbeddingVector(entry.vector);
    if (!vector) continue;
    const cosine = vector.reduce((sum, value, position) => sum + value * query[position], 0);
    candidates.push({ id: claim.id, cosine });
  }
  candidates.sort((a, b) => b.cosine - a.cosine);
  const top = candidates[0]?.cosine ?? 0;
  const second = candidates[1]?.cosine ?? 0;
  // Moderately similar results need separation from competing topics; a high
  // absolute score can still recall several closely related records.
  const root = (id: string) => {
    try { const value = JSON.parse(id); return Array.isArray(value) && ["claim", "supplementary"].includes(value[0]) && typeof value[1] === "string"
      ? { kind: value[0] as string, id: value[1] as string } : { kind: "claim", id }; } catch { return { kind: "claim", id }; }
  };
  const firstClaim = current.get(candidates[0]?.id); const secondClaim = current.get(candidates[1]?.id);
  const firstRoot = firstClaim && root(firstClaim.id); const secondRoot = secondClaim && root(secondClaim.id);
  const support = (claim: KnowledgeClaim) => claim.source.producer === "semantic-document" && claim.source.kind === "automatic_summary"
    && root(claim.id).kind === "supplementary" ? claim.source.supportingClaimIds || [] : [];
  const sameEvidence = firstClaim && secondClaim && firstRoot && secondRoot && (firstRoot.kind === secondRoot.kind && firstRoot.id === secondRoot.id
    || firstRoot.kind === "claim" && support(secondClaim).includes(firstRoot.id)
    || secondRoot.kind === "claim" && support(firstClaim).includes(secondRoot.id)
    || support(firstClaim).some((id) => support(secondClaim).includes(id)));
  // A reflection and its actual supporting fact are corroborating context,
  // not competing unrelated topics. Both still need the absolute threshold.
  if (top < 0.65 && top - second < 0.08 && !sameEvidence) return scores;
  for (const candidate of candidates) if (candidate.cosine >= Math.max(0.4, Math.min(0.95, minimumSimilarity))
    && (candidate.cosine >= 0.75 || top - candidate.cosine <= 0.08)) {
    scores.set(candidate.id, Math.min(1, candidate.cosine));
  }
  return scores;
}
