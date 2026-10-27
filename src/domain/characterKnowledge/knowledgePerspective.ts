import type { CharacterTruthScope, KnowledgeClaim, KnowledgePerspective, KnowledgeSourceRef } from "./characterKnowledgeTypes";
import { describeKnowledgeEvidence } from "./knowledgeEvidence";
import { normalizeKnowledgeSourceInterpretation } from "./knowledgeSourceInterpretation";

type EvidenceRecord = CharacterTruthScope & { source: KnowledgeSourceRef; statement: string; occurredAt?: number;
  validFrom?: number; validTo?: number; status?: string; userConfirmed?: boolean };
/** Derive only what the product owns. Third parties and inferred actors are never assigned canonical IDs. */
export function buildKnowledgePerspective(record: EvidenceRecord): KnowledgePerspective {
  const { source } = record;
  const speaker = source.quotedMessageId && source.messageIds?.includes(source.quotedMessageId)
    ? source.messageAuthors?.[source.quotedMessageId] || source.authorship : source.authorship;
  const evidence = describeKnowledgeEvidence(source, source.evidenceQuote || record.statement, record.characterId);
  const interpretation = normalizeKnowledgeSourceInterpretation(source.interpretation, source.evidenceQuote || record.statement);
  const participated = source.kind === "offline_story" && record.userConfirmed === true;
  const savedExchange = source.kind === "deterministic_action" && source.producer === "shared-media-archive.v1" && source.retainedSnapshot
    && Object.values(source.messageAuthors || {}).includes("user") && Object.values(source.messageAuthors || {}).includes("character");
  const mode = participated ? "confirmed_participation" : source.kind === "deterministic_action" ? "product_action"
    : ["legacy_memory", "import", "automatic_summary"].includes(source.kind) ? "unknown" : source.authorship === "user" ? "reported" : "inference";
  return {
    speaker: { kind: speaker, ...(speaker === "user" ? { id: record.userIdentityId }
      : speaker === "character" ? { id: record.characterId } : {}) },
    acquisition: { holderCharacterId: record.characterId, relationId: record.relationId, userIdentityId: record.userIdentityId,
      ...(record.conversationId ? { conversationId: record.conversationId } : {}), mode,
      from: source.authorship === "user" ? "user" : source.authorship === "system" ? "system" : "unknown",
      sourceIds: [...(source.messageIds || []), ...(source.sourceRecordId ? [source.sourceRecordId] : []), ...(source.storyId ? [source.storyId] : [])],
      ...(source.statementAt !== undefined ? { at: source.statementAt } : {}) },
    participants: participated || savedExchange ? [{ kind: "user", id: record.userIdentityId }, { kind: "character", id: record.characterId }] : [],
    actionActors: source.kind === "deterministic_action" && source.actingIdentityId === record.userIdentityId ? [{ kind: "user", id: record.userIdentityId }] : [],
    ...(interpretation?.roles.length ? { reportedRoles: interpretation.roles.map((role) => ({ ...role,
      mentionId: JSON.stringify(["source-mention", record.characterId, record.relationId, record.userIdentityId, record.conversationId, role.mention]) })) } : {}),
    eventTime: { precision: interpretation?.interval ? "range" : evidence.datePrecision, ...(evidence.eventDate ? { calendar: evidence.eventDate } : {}),
      ...(interpretation?.interval ? { from: interpretation.interval.from, to: interpretation.interval.to } : {}),
      ...(record.occurredAt !== undefined && (participated || source.kind === "deterministic_action") ? { at: record.occurredAt } : {}) },
    ...(source.statementAt !== undefined ? { statementAt: source.statementAt } : {}),
    ...(record.validFrom !== undefined ? { validFrom: record.validFrom } : {}), ...(record.validTo !== undefined ? { validTo: record.validTo } : {}),
    sourceState: record.status === "retracted" ? "retracted" : "active",
  };
}
export function perspectiveMatchesScope(claim: KnowledgeClaim, scope: CharacterTruthScope): boolean {
  const actual = buildKnowledgePerspective(claim).acquisition;
  return actual.holderCharacterId === scope.characterId && actual.relationId === scope.relationId
    && actual.userIdentityId === scope.userIdentityId && actual.conversationId === scope.conversationId && actual.mode !== undefined;
}
