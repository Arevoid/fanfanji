import { removeBehaviorCorrectionsForRelations } from "../../../core/storage/repositories/behaviorCorrectionRepository";
import { removeByRelations as removeKnowledgeClaimsByRelations } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { removeConversationSummariesForRelations } from "../../../core/storage/repositories/conversationSummaryRepository";

export interface CharacterTruthCleanupResult {
  claimsRemoved: boolean;
  summariesRemoved: boolean;
  correctionsRemoved: boolean;
}
/** Relationship deletion is the privacy boundary, so all truth stores are cleared together. */
export function removeCharacterTruthForRelations(relationIds: readonly string[]): CharacterTruthCleanupResult {
  return {
    claimsRemoved: removeKnowledgeClaimsByRelations(relationIds).success,
    summariesRemoved: removeConversationSummariesForRelations(relationIds).success,
    correctionsRemoved: removeBehaviorCorrectionsForRelations(relationIds).success,
  };
}
