import {
  CONVERSATION_SUMMARY_PROJECTION_VERSION,
  CONVERSATION_SUMMARY_SCHEMA_VERSION,
  type CharacterTruthScope,
  type ConversationSummaryRecord,
  type KnowledgeClaim,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";

const summaryClaimRank = (claim: KnowledgeClaim): number => {
  if (claim.truthStatus === "confirmed") return 0;
  if (claim.truthStatus === "asserted") return 1;
  if (claim.kind === "preference") return 2;
  if (claim.kind === "plan" || claim.temporalStatus === "future") return 3;
  if (claim.kind === "hypothesis" || claim.kind === "belief") return 4;
  if (claim.truthStatus === "disputed") return 5;
  if (claim.truthStatus === "legacy_unverified") return 6;
  return 7;
};

/** Keep the semantic guardrails visible after a summary is rebuilt. */
export function getConversationSummaryClaimLabel(claim: KnowledgeClaim): string {
  if (claim.truthStatus === "disputed") return "有争议";
  if (claim.truthStatus === "legacy_unverified") return "旧数据待核验";
  if (claim.kind === "plan" || claim.temporalStatus === "future") return "未来计划，尚未发生";
  if (claim.kind === "hypothesis" || claim.kind === "belief") return "待验证";
  if (claim.kind === "preference") return "偏好";
  if (claim.truthStatus === "confirmed") return "已确认事实";
  if (claim.truthStatus === "asserted") return "用户陈述";
  return "推断";
}

/**
 * Select only active claims whose own evidence belongs to the source window.
 * This prevents a broad relation query from silently leaking unrelated claims
 * into a conversation summary.
 */
export function projectConversationSummaryClaims(input: {
  scope: CharacterTruthScope;
  claims: readonly KnowledgeClaim[];
  sourceMessageIds: readonly string[];
}): KnowledgeClaim[] {
  const sourceMessageIds = new Set(input.sourceMessageIds.filter(Boolean));
  if (sourceMessageIds.size === 0) return [];
  return input.claims
    .filter((claim) => claim.status === "active")
    .filter((claim) => isExactTruthScope(claim, input.scope))
    .filter((claim) => claim.source.messageIds?.some((messageId) => sourceMessageIds.has(messageId)) === true)
    .sort((left, right) =>
      summaryClaimRank(left) - summaryClaimRank(right)
      || left.kind.localeCompare(right.kind)
      || left.recordedAt - right.recordedAt
      || left.id.localeCompare(right.id));
}

/** A source-aware summary remains usable only while all source claims survive. */
export function isConversationSummarySourceValid(
  summary: ConversationSummaryRecord,
  claims: readonly KnowledgeClaim[],
): boolean {
  // Migrated compressedMemory has no canonical source claim IDs yet. It stays
  // readable as a legacy cache, but cannot be rebuilt until new claims exist.
  if (summary.sourceClaimIds.length === 0) return true;
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  return summary.sourceClaimIds.every((claimId) => {
    const claim = claimsById.get(claimId);
    return Boolean(claim
      && claim.status === "active"
      && !claim.supersededById
      && isExactTruthScope(claim, summary));
  });
}

export function createConversationSummaryRecord(input: {
  scope: CharacterTruthScope;
  claims: readonly KnowledgeClaim[];
  sourceMessageIds: readonly string[];
  generatedAt: number;
  /** Stable owner supplied by replaceable workflows such as offline stories. */
  id?: string;
  generator?: string;
  rangeStartAt?: number;
  rangeEndAt?: number;
}): ConversationSummaryRecord | undefined {
  const sourceMessageIds = Array.from(new Set(input.sourceMessageIds.filter(Boolean))).sort();
  const claims = projectConversationSummaryClaims({
    scope: input.scope,
    claims: input.claims,
    sourceMessageIds,
  });
  const sourceClaimIds = claims.map((claim) => claim.id).sort();
  if (claims.length === 0 || sourceMessageIds.length === 0) return undefined;
  const claimTimes = claims
    .map((claim) => claim.occurredAt ?? claim.recordedAt)
    .filter((timestamp): timestamp is number => Number.isFinite(timestamp));
  const derivedRangeStartAt = claimTimes.length > 0 ? Math.min(...claimTimes) : undefined;
  const derivedRangeEndAt = claimTimes.length > 0 ? Math.max(...claimTimes) : undefined;
  const rangeStartAt = input.rangeStartAt ?? derivedRangeStartAt;
  const rangeEndAt = input.rangeEndAt ?? derivedRangeEndAt;
  const id = input.id || `conversation-summary:${input.scope.relationId}:${sourceMessageIds[0]}:${sourceMessageIds[sourceMessageIds.length - 1]}`;
  return {
    id,
    ...input.scope,
    summary: claims
      .map((claim) => `- [${getConversationSummaryClaimLabel(claim)}] ${claim.statement}`)
      .join("\n"),
    sourceMessageIds,
    sourceClaimIds,
    ...(rangeStartAt !== undefined ? { rangeStartAt } : {}),
    ...(rangeEndAt !== undefined ? { rangeEndAt } : {}),
    generatedAt: input.generatedAt,
    generator: input.generator || "character-truth-extraction.v1",
    projectionVersion: CONVERSATION_SUMMARY_PROJECTION_VERSION,
    status: "active",
    schemaVersion: CONVERSATION_SUMMARY_SCHEMA_VERSION,
  };
}

/** Rebuild a derived cache without changing its provenance or identity. */
export function rebuildConversationSummaryRecord(input: {
  summary: ConversationSummaryRecord;
  claims: readonly KnowledgeClaim[];
  generatedAt?: number;
}): ConversationSummaryRecord | undefined {
  const rebuilt = createConversationSummaryRecord({
    scope: input.summary,
    claims: input.claims,
    sourceMessageIds: input.summary.sourceMessageIds,
    generatedAt: input.generatedAt ?? input.summary.generatedAt,
    generator: input.summary.generator,
    rangeStartAt: input.summary.rangeStartAt,
    rangeEndAt: input.summary.rangeEndAt,
  });
  if (!rebuilt) return undefined;
  return {
    ...rebuilt,
    id: input.summary.id,
    ...(input.summary.sourceRecordId ? { sourceRecordId: input.summary.sourceRecordId } : {}),
    projectionVersion: CONVERSATION_SUMMARY_PROJECTION_VERSION,
  };
}

/** Mark only derived summaries stale; their source claims and audit history stay intact. */
export function reconcileConversationSummaryRecords(
  summaries: readonly ConversationSummaryRecord[],
  claims: readonly KnowledgeClaim[],
): ConversationSummaryRecord[] {
  return summaries.map((summary) => summary.status === "active" && !isConversationSummarySourceValid(summary, claims)
    ? { ...summary, status: "stale" as const }
    : summary);
}
