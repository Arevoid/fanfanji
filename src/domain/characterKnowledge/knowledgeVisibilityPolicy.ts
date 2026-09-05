import type { CharacterTruthScope, KnowledgeClaim, KnowledgePromptProjection } from "./characterKnowledgeTypes";
import { isExactTruthScope } from "./knowledgeConflictPolicy";
import { isKnowledgeTemporallyActive } from "./knowledgeTemporalPolicy";

export const isKnowledgeVisibleToScope = (claim: KnowledgeClaim, scope: CharacterTruthScope): boolean =>
  claim.visibility === "relation_private" && isExactTruthScope(claim, scope);

/** Relation-private truth is never public merely because it is safe in a direct prompt. */
export const canExposeKnowledgeClaimPublicly = (_claim: KnowledgeClaim): false => false;

export function selectKnowledgeForPrivatePrompt(
  claims: readonly KnowledgeClaim[],
  scope: CharacterTruthScope,
  now = Date.now(),
): KnowledgePromptProjection {
  const visible = claims.filter((claim) =>
    isKnowledgeVisibleToScope(claim, scope)
      && isKnowledgeTemporallyActive(claim, now)
      && !claim.supersededById,
  );
  const governed = visible.filter((claim) => claim.truthStatus !== "legacy_unverified" && claim.truthStatus !== "disputed");
  return {
    // Temporal semantics take precedence over truth status. A malformed or
    // older record cannot move a future plan into the past-fact bucket just
    // because its kind was persisted as `fact`.
    confirmedFacts: governed.filter((claim) => claim.temporalStatus !== "future" && claim.kind === "fact" && claim.truthStatus === "confirmed"),
    userAssertions: governed.filter((claim) => claim.temporalStatus !== "future" && claim.kind === "fact" && claim.truthStatus === "asserted"),
    preferences: governed.filter((claim) => claim.temporalStatus !== "future" && claim.kind === "preference"),
    futurePlans: governed.filter((claim) => claim.kind === "plan" || claim.temporalStatus === "future"),
    // An inferred fact is still not a fact the character may assume. Keep it
    // in the explicitly cautious bucket instead of silently dropping it.
    openBeliefsAndHypotheses: governed.filter((claim) =>
      claim.kind === "belief" || claim.kind === "hypothesis" || claim.truthStatus === "inferred",
    ),
    disputed: visible.filter((claim) => claim.truthStatus === "disputed"),
    legacyUnverified: visible.filter((claim) => claim.truthStatus === "legacy_unverified"),
  };
}
