import type {
  BehaviorCorrectionRecord,
  CharacterTruthScope,
  ConversationSummaryRecord,
  KnowledgeClaim,
  KnowledgePromptProjection,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { isKnowledgeTemporallyActive, temporalStatusLabel } from "../../../domain/characterKnowledge/knowledgeTemporalPolicy";
import { selectKnowledgeForPrivatePrompt } from "../../../domain/characterKnowledge/knowledgeVisibilityPolicy";
import { DEFAULT_TRUTH_PROMPT_CHARACTER_LIMIT, truncatePromptText } from "../../../domain/memory/memoryRecallPolicy";
import { isConversationSummarySourceValid } from "./conversationSummaryService";

export interface TruthRetrievalInput {
  scope: CharacterTruthScope;
  /** Public/hypothetical callers must opt into their own visibility boundary. */
  scenario?: "private" | "public" | "hypothetical";
  queryText?: string;
  limit?: number;
  /** Soft prompt budget for Truth and behavior-correction blocks. */
  maxCharacters?: number;
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
  promptCharacterLimit?: number;
}

const countProjectionClaims = (projection: KnowledgePromptProjection): number => Object.values(projection)
  .reduce((count, claims) => count + claims.length, 0);

/**
 * Count every Truth-side record that can be rendered into the prompt. The
 * user-facing long-term recall limit is a total prompt-record budget, not a
 * separate limit for each storage table.
 */
export const countTruthRetrievalRecords = (result: Pick<TruthRetrievalResult, "projection" | "summaries" | "corrections">): number =>
  countProjectionClaims(result.projection) + result.summaries.length + result.corrections.length;

export type TruthProjectionDiagnosticReason =
  | "included"
  | "scope_mismatch"
  | "paused"
  | "inactive"
  | "superseded"
  | "temporally_inactive"
  | "scenario_hidden"
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

const sourceQuality = (claim: KnowledgeClaim): number => {
  const base: Record<KnowledgeClaim["source"]["kind"], number> = {
    manual: 4,
    deterministic_action: 4,
    user_message: 3,
    automatic_summary: 3,
    offline_story: 3,
    import: 2,
    ooc_correction: 1,
    legacy_memory: 0,
  };
  const authorship = claim.source.authorship === "user" ? 1 : claim.source.authorship === "system" ? 0.5 : 0;
  return (base[claim.source.kind] || 0) + authorship;
};

const claimImportance = (claim: KnowledgeClaim): number => claim.importance ?? (
  claim.truthStatus === "confirmed"
    ? 8
    : claim.userConfirmed
      ? 7
      : claim.kind === "preference"
        ? 6
        : claim.kind === "plan"
          ? 5
          : claim.kind === "belief" || claim.kind === "hypothesis"
            ? 4
            : 3
);

const rankClaims = (claims: readonly KnowledgeClaim[], queryText: string, limit: number): KnowledgeClaim[] => {
  const truthWeight: Record<KnowledgeClaim["truthStatus"], number> = {
    confirmed: 6,
    asserted: 5,
    inferred: 2,
    disputed: 1,
    legacy_unverified: 0,
    retracted: -10,
  };
  const timestamps = claims.map((claim) => claim.recordedAt).filter(Number.isFinite);
  const oldest = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const newest = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  const timestampRange = Math.max(0, newest - oldest);
  return [...claims]
    .filter((claim, index, all) => claim.status === "active" && !claim.recallDisabled && all.findIndex((candidate) => candidate.id === claim.id) === index)
    .sort((left, right) => {
      const leftRecency = timestampRange > 0 ? (left.recordedAt - oldest) / timestampRange : 0;
      const rightRecency = timestampRange > 0 ? (right.recordedAt - oldest) / timestampRange : 0;
      const leftScore = scoreText(left.statement, queryText) * 10
        + truthWeight[left.truthStatus] * 2
        + sourceQuality(left)
        + claimImportance(left) * 0.35
        + left.confidence
        + leftRecency * 2;
      const rightScore = scoreText(right.statement, queryText) * 10
        + truthWeight[right.truthStatus] * 2
        + sourceQuality(right)
        + claimImportance(right) * 0.35
        + right.confidence
        + rightRecency * 2;
      return rightScore - leftScore || right.recordedAt - left.recordedAt || left.id.localeCompare(right.id);
    })
    .slice(0, limit);
};

export function retrieveTruthForPrivatePrompt(input: TruthRetrievalInput): TruthRetrievalResult {
  const now = input.now ?? Date.now();
  const limit = Math.max(1, input.limit ?? 8);
  const scenario = input.scenario ?? "private";
  const scopedClaims = scenario === "public"
    ? []
    : input.claims.filter((claim) =>
      isExactTruthScope(claim, input.scope)
        && isKnowledgeTemporallyActive(claim, now)
        && !claim.recallDisabled
        && !claim.supersededById,
    );
  const ranked = rankClaims(scopedClaims, input.queryText || "", limit);
  const projection = selectKnowledgeForPrivatePrompt(ranked, input.scope, now);
  const candidateSummaries = input.summaries
    .filter((summary) => scenario !== "public"
      && isExactTruthScope(summary, input.scope)
      && summary.status === "active"
      && isConversationSummarySourceValid(summary, input.claims))
    .sort((left, right) =>
      scoreText(right.summary, input.queryText || "") - scoreText(left.summary, input.queryText || "")
      || right.generatedAt - left.generatedAt
      || left.id.localeCompare(right.id))
    .slice(0, Math.max(1, Math.min(3, limit)));
  const candidateCorrections = input.corrections
    .filter((correction) => isExactTruthScope(correction, input.scope) && correction.status === "active")
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(1, Math.min(5, limit)));
  // Claims are authoritative. Fill remaining slots with behavior corrections
  // before rebuildable summaries, keeping the Truth-side result within the
  // caller's total long-term recall budget.
  const claimCount = countProjectionClaims(projection);
  const correctionCount = Math.min(candidateCorrections.length, Math.max(0, limit - claimCount));
  const corrections = candidateCorrections.slice(0, correctionCount);
  const summaryCount = Math.min(candidateSummaries.length, Math.max(0, limit - claimCount - corrections.length));
  const summaries = candidateSummaries.slice(0, summaryCount);
  return {
    projection,
    summaries,
    corrections,
    shadowedLegacyMemoryIds: scopedClaims
      .filter((claim) => claim.source.kind === "legacy_memory" && Boolean(claim.source.sourceRecordId))
      .map((claim) => claim.source.sourceRecordId as string),
    promptCharacterLimit: input.maxCharacters ?? DEFAULT_TRUTH_PROMPT_CHARACTER_LIMIT,
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
    (input.scenario ?? "private") === "public"
      ? []
      : input.claims.filter((claim) =>
        isExactTruthScope(claim, input.scope)
          && isKnowledgeTemporallyActive(claim, now)
          && !claim.recallDisabled
          && !claim.supersededById,
      ),
    input.queryText || "",
    Math.max(1, input.limit ?? 8),
  ).map((claim) => claim.id));
  return input.claims.map((claim) => {
    if (!isExactTruthScope(claim, input.scope)) return { claimId: claim.id, included: false, reason: "scope_mismatch", source: claim.source };
    if (claim.recallDisabled) return { claimId: claim.id, included: false, reason: "paused", source: claim.source };
    if (claim.status !== "active") return { claimId: claim.id, included: false, reason: "inactive", source: claim.source };
    if (claim.supersededById) return { claimId: claim.id, included: false, reason: "superseded", source: claim.source };
    if ((input.scenario ?? "private") === "public") return { claimId: claim.id, included: false, reason: "scenario_hidden", source: claim.source };
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

export function formatTruthRetrievalForPrompt(result: TruthRetrievalResult, options: { maxCharacters?: number } = {}): string {
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
  // ConversationSummary is a rebuildable cache of the same KnowledgeClaims
  // formatted above. Feeding both representations repeats and amplifies the
  // same fact. Keep summaries available to UI/diagnostics, but make Truth the
  // single prompt authority.
  const correctionBlock = result.corrections.length > 0
    ? `\n[Behavior corrections / 人设修正]\n${result.corrections.map((correction) => `- ${correction.instruction}`).join("\n")}`
    : "";
  const summaryBlock = result.summaries.length > 0
    ? `\n[Conversation summary / 对话摘要（非权威补充）]\n这些摘要只是可重建的压缩缓存；如果与上面的具体事实、计划、假设或纠正冲突，以具体分组内容为准。\n${result.summaries.map((summary) => `- ${summary.summary.trim()}`).join("\n")}`
    : "";
  const fullPrompt = `${blocks}${correctionBlock}${summaryBlock}`;
  const maxCharacters = options.maxCharacters ?? result.promptCharacterLimit;
  return maxCharacters === undefined
    ? fullPrompt
    : truncatePromptText(fullPrompt, Math.max(120, maxCharacters));
}
