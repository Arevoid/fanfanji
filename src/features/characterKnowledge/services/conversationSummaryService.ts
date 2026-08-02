import {
  CONVERSATION_SUMMARY_SCHEMA_VERSION,
  type CharacterTruthScope,
  type ConversationSummaryRecord,
  type KnowledgeClaim,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";

export function createConversationSummaryRecord(input: {
  scope: CharacterTruthScope;
  claims: readonly KnowledgeClaim[];
  sourceMessageIds: readonly string[];
  generatedAt: number;
  generator?: string;
  rangeStartAt?: number;
  rangeEndAt?: number;
}): ConversationSummaryRecord | undefined {
  const claims = input.claims.filter((claim) => claim.relationId === input.scope.relationId && claim.characterId === input.scope.characterId && claim.userIdentityId === input.scope.userIdentityId);
  const sourceMessageIds = Array.from(new Set(input.sourceMessageIds.filter(Boolean)));
  const sourceClaimIds = Array.from(new Set(claims.map((claim) => claim.id).filter(Boolean)));
  if (claims.length === 0 || sourceMessageIds.length === 0) return undefined;
  const id = `conversation-summary:${input.scope.relationId}:${sourceMessageIds[0]}:${sourceMessageIds[sourceMessageIds.length - 1]}`;
  return {
    id,
    ...input.scope,
    summary: claims.map((claim) => `- ${claim.statement}`).join("\n"),
    sourceMessageIds,
    sourceClaimIds,
    ...(input.rangeStartAt !== undefined ? { rangeStartAt: input.rangeStartAt } : {}),
    ...(input.rangeEndAt !== undefined ? { rangeEndAt: input.rangeEndAt } : {}),
    generatedAt: input.generatedAt,
    generator: input.generator || "character-truth-extraction.v1",
    projectionVersion: 1,
    status: "active",
    schemaVersion: CONVERSATION_SUMMARY_SCHEMA_VERSION,
  };
}
