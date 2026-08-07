import type {
  BehaviorCorrectionRecord,
  CharacterTruthScope,
  ConversationSummaryRecord,
  KnowledgeClaim,
  KnowledgePromptProjection,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { isSameTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { isKnowledgeTemporallyActive, temporalStatusLabel } from "../../../domain/characterKnowledge/knowledgeTemporalPolicy";
import { selectKnowledgeForPrivatePrompt } from "../../../domain/characterKnowledge/knowledgeVisibilityPolicy";

export interface TruthRetrievalInput {
  scope: CharacterTruthScope;
  queryText?: string;
  limit?: number;
  now?: number;
  claims: readonly KnowledgeClaim[];
  summaries: readonly ConversationSummaryRecord[];
  corrections: readonly BehaviorCorrectionRecord[];
}

export interface TruthRetrievalResult {
  projection: KnowledgePromptProjection;
  summaries: ConversationSummaryRecord[];
  corrections: BehaviorCorrectionRecord[];
  shadowedLegacyMemoryIds: string[];
}

export type TruthProjectionDiagnosticReason =
  | "included"
  | "scope_mismatch"
  | "inactive"
  | "temporally_inactive"
  | "retrieval_limit"
  | "unsupported_status_bucket";

export interface TruthProjectionDiagnostic {
  claimId: string;
  included: boolean;
  reason: TruthProjectionDiagnosticReason;
  source: KnowledgeClaim["source"];
}

const scoreText = (text: string, queryText: string): number => {
  if (!queryText.trim()) return 0;
  const words = queryText.toLocaleLowerCase().split(/[\s,.:;!?"'，（）()，。！“”]+/u).filter((word) => word.length > 0);
  const lower = text.toLocaleLowerCase();
  return words.reduce((score, word) => score + (lower.includes(word) ? word.length : 0), 0);
};

const rankClaims = (claims: readonly KnowledgeClaim[], queryText: string, limit: number): KnowledgeClaim[] => {
  const truthWeight: Record<KnowledgeClaim["truthStatus"], number> = {
    confirmed: 5,
    asserted: 4,
    inferred: 2,
    disputed: 1,
    legacy_unverified: 0,
    retracted: -10,
  };
  return [...claims]
    .filter((claim) => claim.status === "active")
    .sort((left, right) => {
      const leftScore = scoreText(left.statement, queryText) + truthWeight[left.truthStatus] + left.confidence;
      const rightScore = scoreText(right.statement, queryText) + truthWeight[right.truthStatus] + right.confidence;
      return rightScore - leftScore || right.recordedAt - left.recordedAt || left.id.localeCompare(right.id);
    })
    .slice(0, limit);
};

export function retrieveTruthForPrivatePrompt(input: TruthRetrievalInput): TruthRetrievalResult {
  const now = input.now ?? Date.now();
  const limit = Math.max(1, input.limit ?? 8);
  const scopedClaims = input.claims.filter((claim) => isSameTruthScope(claim, input.scope) && isKnowledgeTemporallyActive(claim, now));
  const ranked = rankClaims(scopedClaims, input.queryText || "", limit);
  const projection = selectKnowledgeForPrivatePrompt(ranked, input.scope, now);
  const summaries = input.summaries
    .filter((summary) => isSameTruthScope(summary, input.scope) && summary.status === "active")
    .sort((left, right) => right.generatedAt - left.generatedAt)
    .slice(0, Math.max(1, Math.min(3, limit)));
  const corrections = input.corrections
    .filter((correction) => isSameTruthScope(correction, input.scope) && correction.status === "active")
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(1, Math.min(5, limit)));
  return {
    projection,
    summaries,
    corrections,
    shadowedLegacyMemoryIds: scopedClaims
      .filter((claim) => claim.source.kind === "legacy_memory" && Boolean(claim.source.sourceRecordId))
      .map((claim) => claim.source.sourceRecordId as string),
  };
}

/** Read-only audit explanation for why each candidate reached the prompt projection or not. */
export function explainTruthProjection(input: TruthRetrievalInput): TruthProjectionDiagnostic[] {
  const now = input.now ?? Date.now();
  const result = retrieveTruthForPrivatePrompt(input);
  const includedIds = new Set([
    ...result.projection.confirmedFacts,
    ...result.projection.userAssertions,
    ...result.projection.preferences,
    ...result.projection.futurePlans,
    ...result.projection.openBeliefsAndHypotheses,
    ...result.projection.disputed,
    ...result.projection.legacyUnverified,
  ].map((claim) => claim.id));
  const rankedIds = new Set(rankClaims(
    input.claims.filter((claim) => isSameTruthScope(claim, input.scope) && isKnowledgeTemporallyActive(claim, now)),
    input.queryText || "",
    Math.max(1, input.limit ?? 8),
  ).map((claim) => claim.id));
  return input.claims.map((claim) => {
    if (!isSameTruthScope(claim, input.scope)) return { claimId: claim.id, included: false, reason: "scope_mismatch", source: claim.source };
    if (claim.status !== "active") return { claimId: claim.id, included: false, reason: "inactive", source: claim.source };
    if (!isKnowledgeTemporallyActive(claim, now)) return { claimId: claim.id, included: false, reason: "temporally_inactive", source: claim.source };
    if (!rankedIds.has(claim.id)) return { claimId: claim.id, included: false, reason: "retrieval_limit", source: claim.source };
    if (includedIds.has(claim.id)) return { claimId: claim.id, included: true, reason: "included", source: claim.source };
    return { claimId: claim.id, included: false, reason: "unsupported_status_bucket", source: claim.source };
  });
}

const formatClaims = (title: string, claims: readonly KnowledgeClaim[], options: { caution?: string } = {}): string => {
  if (claims.length === 0) return "";
  return `\n[${title}]${options.caution ? `\n${options.caution}` : ""}\n${claims.map((claim) => `- ${claim.statement}${claim.temporalStatus !== "unknown" ? `（${temporalStatusLabel(claim.temporalStatus)}）` : ""}`).join("\n")}`;
};

export function formatTruthRetrievalForPrompt(result: TruthRetrievalResult): string {
  const { projection } = result;
  const blocks = [
    formatClaims("Confirmed facts / 已确认事实", projection.confirmedFacts),
    formatClaims("User assertions / 用户明确陈述", projection.userAssertions),
    formatClaims("Preferences / 偏好", projection.preferences),
    formatClaims("Future plans / 尚未发生的计划", projection.futurePlans, { caution: "这些是计划，不得改写成已经发生的事实。" }),
    formatClaims("Open beliefs and hypotheses / 待验证信念与假设", projection.openBeliefsAndHypotheses, { caution: "这些内容不能直接当作确定事实。" }),
    formatClaims("Disputed claims / 有争议内容", projection.disputed, { caution: "存在冲突，只能谨慎提及，不可擅自裁决。" }),
    formatClaims("Legacy unverified / 旧数据待核验 / source=legacy-unverified", projection.legacyUnverified, { caution: "仅作线索，未经用户确认不得当作真实事实。" }),
  ].filter(Boolean).join("");
  const summaryBlock = result.summaries.length > 0
    ? `\n[Derived summaries / 对话摘要（派生缓存，非权威事实；source=derived-summary；低于已确认事实）]\n${result.summaries.map((summary) => `- ${summary.summary}`).join("\n")}`
    : "";
  const correctionBlock = result.corrections.length > 0
    ? `\n[Behavior corrections / 人设修正]\n${result.corrections.map((correction) => `- ${correction.instruction}`).join("\n")}`
    : "";
  return `${blocks}${summaryBlock}${correctionBlock}`;
}
