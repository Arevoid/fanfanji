import type { UserSettings } from "../../../types";
import type { CharacterTruthScope } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { semanticFactRegistry } from "../../../domain/characterKnowledge/semanticFactResolution";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { contributeSemanticDirectReplyTruthContext } from "./semanticMemoryRecallService";
/** Reuse the scoped, budgeted index to find old semantic identities outside the local recent registry. */
export async function prepareMemoryIdentityRegistry(scope: CharacterTruthScope, settings: UserSettings, query: string) {
  const claims = loadKnowledgeClaims().value;
  const result = settings.memoryEmbedding?.enabled ? await contributeSemanticDirectReplyTruthContext({ configuration: settings.memoryEmbedding,
    retrieval: { scope, claims, summaries: loadConversationSummaries().value, corrections: [], queryText: query, queryConstraints: {}, limit: 12, maxCharacters: 3000 } }) : undefined;
  return [...semanticFactRegistry(result?.orderedClaims || [], scope, query), ...semanticFactRegistry(claims, scope, query)]
    .filter((record, index, records) => records.findIndex((other) => other.id === record.id) === index).slice(0, 48);
}
