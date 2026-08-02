import type { CharacterTruthScope, KnowledgeClaim, KnowledgePromptProjection } from "./characterKnowledgeTypes";
import { isSameTruthScope } from "./knowledgeConflictPolicy";
import { isKnowledgeTemporallyActive } from "./knowledgeTemporalPolicy";

export const isKnowledgeVisibleToScope = (claim: KnowledgeClaim, scope: CharacterTruthScope): boolean =>
  claim.visibility === "relation_private" && isSameTruthScope(claim, scope);

/** Relation-private truth is never public merely because it is safe in a direct prompt. */
export const canExposeKnowledgeClaimPublicly = (_claim: KnowledgeClaim): false => false;

export function selectKnowledgeForPrivatePrompt(
  claims: readonly KnowledgeClaim[],
  scope: CharacterTruthScope,
  now = Date.now(),
): KnowledgePromptProjection {
  const visible = claims.filter((claim) => isKnowledgeVisibleToScope(claim, scope) && isKnowledgeTemporallyActive(claim, now));
  const governed = visible.filter((claim) => claim.truthStatus !== "legacy_unverified" && claim.truthStatus !== "disputed");
  return {
    confirmedFacts: governed.filter((claim) => claim.kind === "fact" && claim.truthStatus === "confirmed"),
    userAssertions: governed.filter((claim) => claim.kind === "fact" && claim.truthStatus === "asserted"),
    preferences: governed.filter((claim) => claim.kind === "preference"),
    futurePlans: governed.filter((claim) => claim.kind === "plan" && claim.temporalStatus === "future"),
    openBeliefsAndHypotheses: governed.filter((claim) => claim.kind === "belief" || claim.kind === "hypothesis"),
    disputed: visible.filter((claim) => claim.truthStatus === "disputed"),
    legacyUnverified: visible.filter((claim) => claim.truthStatus === "legacy_unverified"),
  };
}
