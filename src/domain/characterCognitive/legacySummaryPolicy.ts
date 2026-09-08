/** The only source label allowed for summaries kept on legacy records. */
export const LEGACY_SUMMARY_SOURCE = "legacy-unverified" as const;

export interface LegacySummaryProjection {
  content: string;
  source: typeof LEGACY_SUMMARY_SOURCE;
}

export interface LegacySummaryPolicyInput {
  summary?: string;
  /** Scope recorded with the summary, when available. */
  summaryRelationId?: string;
  /** Scope requested by the current cognitive turn. */
  targetRelationId: string;
  hasConfirmedEvent: boolean;
  hasConfirmedClaim: boolean;
  hasDerivedSummary: boolean;
}

/**
 * Projects an old compressed summary as a weak, explicitly labelled hint.
 * Confirmed event/claim data and derived summaries always outrank it. A
 * missing or foreign relation scope fails closed rather than guessing.
 */
export const projectLegacySummary = (
  input: LegacySummaryPolicyInput,
): LegacySummaryProjection | undefined => {
  const content = input.summary?.trim();
  if (!content || !input.targetRelationId || !input.summaryRelationId) return undefined;
  if (input.summaryRelationId !== input.targetRelationId) return undefined;
  if (input.hasConfirmedEvent || input.hasConfirmedClaim || input.hasDerivedSummary) return undefined;
  return { content, source: LEGACY_SUMMARY_SOURCE };
};
