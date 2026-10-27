import type { CharacterTruthScope, ConversationSummaryRecord, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterContinuityStore } from "../../../domain/memory/characterContinuity";
import { eligibleHistoricalImpression, eligibleImpressionEvidence, reconcileImpressions } from "../../../domain/memory/characterContinuity";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { isConversationSummarySourceValid } from "./conversationSummaryService";
/** Transient index documents never become persisted facts or gain truth authority. */
export function supplementarySemanticDocuments(scope: CharacterTruthScope, claims: readonly KnowledgeClaim[], summaries: readonly ConversationSummaryRecord[],
  store: CharacterContinuityStore, now: number, includeHistorical = false): KnowledgeClaim[] {
  const document = (id: string, text: string, time: number, sourceClaimIds: string[] = []): KnowledgeClaim => ({
    ...scope, id, statement: text, kind: "hypothesis", subject: "character", truthStatus: "inferred", temporalStatus: "past", status: "active",
    visibility: "relation_private", confidence: .4, userConfirmed: false, recordedAt: time, schemaVersion: 1,
    source: { kind: "automatic_summary", authorship: "system", producer: "semantic-document", evidenceKey: JSON.stringify([id, sourceClaimIds,
      sourceClaimIds.map((ref) => claims.find((claim) => claim.id === ref || claim.mergedClaimIds?.includes(ref)))]), sourceRecordId: id,
      supportingClaimIds: [...new Set([...sourceClaimIds, ...sourceClaimIds.flatMap((ref) => {
        const claim = claims.find((item) => item.id === ref || item.mergedClaimIds?.includes(ref)); return claim ? [claim.id] : []; })])] } });
  const records = summaries.filter((summary) => isExactTruthScope(summary, scope) && summary.status === "active" && isConversationSummarySourceValid(summary, claims))
    .map((summary) => document(`summary:${summary.id}`, summary.summary, summary.generatedAt, summary.sourceClaimIds));
  for (const impression of reconcileImpressions(store.impressions, claims, now)) {
    if (isExactTruthScope(impression.scope, scope) && !impression.paused && (impression.status === "active"
      && (impression.intervention || impression.sourceClaimIds.every((ref) => claims.some((claim) =>
        (claim.id === ref || claim.mergedClaimIds?.includes(ref)) && eligibleImpressionEvidence(claim, scope, now))))
      || includeHistorical && impression.status === "superseded" && eligibleHistoricalImpression(impression, claims, now))) {
      records.push(document(`impression:${impression.id}`, `${impression.status === "active" ? "" : "[历史主观认识] "}${impression.category}：${impression.proposition}`, impression.recordedAt, impression.sourceClaimIds));
    }
  }
  for (const episode of store.life) {
    if (episode.characterId === scope.characterId && episode.userIdentityId === scope.userIdentityId && (!episode.supersededById || includeHistorical)
      && (episode.status !== "cancelled" || includeHistorical) && episode.occurredAt <= now) {
      records.push(document(`life:${episode.id}`, `[虚拟生活/${episode.status}] ${episode.summary}`, episode.recordedAt));
    }
  }
  return records;
}
