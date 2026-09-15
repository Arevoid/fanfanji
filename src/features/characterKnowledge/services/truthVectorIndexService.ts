import type { CharacterTruthScope, ConversationSummaryRecord, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { buildSemanticVector, cosineSimilarity } from "../../../domain/memory/semanticVector";
import {
  loadTruthVectorIndexRecords,
  saveTruthVectorIndexRecords,
  type TruthVectorIndexRecord,
} from "../../../core/storage/truthVectorIndexDb";

export interface TruthVectorCandidate {
  id: string;
  kind: TruthVectorIndexRecord["kind"];
  text: string;
  score: number;
}

export const truthVectorScopeKey = (scope: CharacterTruthScope): string => [
  scope.relationId,
  scope.characterId,
  scope.userIdentityId,
  scope.conversationId || "",
].join("\u0000");

export const buildTruthVectorRecords = (
  claims: readonly KnowledgeClaim[],
  summaries: readonly ConversationSummaryRecord[],
  now = Date.now(),
): TruthVectorIndexRecord[] => {
  const records: TruthVectorIndexRecord[] = [];
  claims.filter((claim) => claim.status === "active" && !claim.recallDisabled).forEach((claim) => records.push({
    id: `claim:${claim.id}`,
    kind: "claim",
    scopeKey: truthVectorScopeKey(claim),
    relationId: claim.relationId,
    characterId: claim.characterId,
    userIdentityId: claim.userIdentityId,
    ...(claim.conversationId ? { conversationId: claim.conversationId } : {}),
    text: claim.statement,
    vector: buildSemanticVector(claim.statement),
    updatedAt: now,
  }));
  summaries.filter((summary) => summary.status === "active").forEach((summary) => records.push({
    id: `episode:${summary.id}`,
    kind: "episode",
    scopeKey: truthVectorScopeKey(summary),
    relationId: summary.relationId,
    characterId: summary.characterId,
    userIdentityId: summary.userIdentityId,
    ...(summary.conversationId ? { conversationId: summary.conversationId } : {}),
    text: summary.summary,
    vector: buildSemanticVector(summary.summary),
    updatedAt: now,
  }));
  return records;
};

export const rankTruthVectorCandidates = (
  queryText: string,
  records: readonly Pick<TruthVectorIndexRecord, "id" | "kind" | "text" | "vector">[],
  limit = 8,
): TruthVectorCandidate[] => {
  const queryVector = buildSemanticVector(queryText);
  return records.map((record) => ({
    id: record.id,
    kind: record.kind,
    text: record.text,
    score: cosineSimilarity(queryVector, record.vector),
  })).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, Math.max(1, limit));
};

/** Persist an exact-scope index opportunistically; retrieval remains fail-open. */
export async function persistTruthVectorIndex(
  claims: readonly KnowledgeClaim[],
  summaries: readonly ConversationSummaryRecord[],
): Promise<{ success: boolean; count: number }> {
  const records = buildTruthVectorRecords(claims, summaries);
  if (records.length === 0) return { success: true, count: 0 };
  try {
    await saveTruthVectorIndexRecords(records);
    return { success: true, count: records.length };
  } catch {
    return { success: false, count: records.length };
  }
}

export async function loadTruthVectorIndex(scope: CharacterTruthScope): Promise<TruthVectorIndexRecord[]> {
  try {
    return await loadTruthVectorIndexRecords(truthVectorScopeKey(scope));
  } catch {
    return [];
  }
}
