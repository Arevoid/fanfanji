import type { ConversationSummaryRecord } from "../../domain/characterKnowledge/characterKnowledgeTypes";

export type ConversationSummaryEquivalenceField =
  | "scope"
  | "summary"
  | "sourceClaimIds"
  | "sourceMessageIds"
  | "status"
  | "projectionVersion"
  | "generatorSemantics"
  | "canonicalRevision"
  | "schemaVersion";

export interface ConversationSummaryEquivalenceDiagnostics {
  equivalent: boolean;
  mismatchFields: ConversationSummaryEquivalenceField[];
  generatedAtDeltaMs: number;
}

const sameArray = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const normalizedText = (value: string): string => value.trim().replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");

const generatorSemantics = (value: string): string => value.startsWith("memory-projection.conversation-summary")
  || value.startsWith("character-truth-extraction")
  ? "conversation_summary"
  : value;

/** Compares only bounded metadata; no Summary body is returned or persisted. */
export function compareConversationSummaryProjectionEquivalence(
  synchronous: ConversationSummaryRecord,
  background: ConversationSummaryRecord,
): ConversationSummaryEquivalenceDiagnostics {
  const mismatchFields: ConversationSummaryEquivalenceField[] = [];
  const scopeMatches = synchronous.characterId === background.characterId
    && synchronous.relationId === background.relationId
    && synchronous.userIdentityId === background.userIdentityId
    && synchronous.conversationId === background.conversationId;
  if (!scopeMatches) mismatchFields.push("scope");
  if (normalizedText(synchronous.summary) !== normalizedText(background.summary)) mismatchFields.push("summary");
  if (!sameArray(synchronous.sourceClaimIds, background.sourceClaimIds)) mismatchFields.push("sourceClaimIds");
  if (!sameArray(synchronous.sourceMessageIds, background.sourceMessageIds)) mismatchFields.push("sourceMessageIds");
  if (synchronous.status !== background.status) mismatchFields.push("status");
  if (synchronous.projectionVersion !== background.projectionVersion) mismatchFields.push("projectionVersion");
  if (generatorSemantics(synchronous.generator) !== generatorSemantics(background.generator)) mismatchFields.push("generatorSemantics");
  if (synchronous.canonicalRevision !== background.canonicalRevision) mismatchFields.push("canonicalRevision");
  if (synchronous.schemaVersion !== background.schemaVersion) mismatchFields.push("schemaVersion");
  return {
    equivalent: mismatchFields.length === 0,
    mismatchFields,
    generatedAtDeltaMs: Math.abs(synchronous.generatedAt - background.generatedAt),
  };
}
