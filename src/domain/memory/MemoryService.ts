import { splitOfflineSourceText } from "./offlineArchivePolicy";
import { sourceRevision } from "../characterKnowledge/knowledgeEvolution";
import type { MemoryItem } from "../../types";
import { isDuplicateMemory, isDuplicateMemoryMarker } from "./MemoryDeduplicator";
import { extractMemories } from "./MemoryExtractor";
import { evolveKnowledgeClaims } from "../characterKnowledge/knowledgeEvolution";
import { retrieveRelevantMemories, retrieveRelevantMemoriesForScopes } from "./MemoryRetriever";
import { formatDelicateMemoryDiary, formatExtractedMemorySummary, formatMemoriesForPrompt } from "./memoryFormatter";
import type { MemoryExtractionApi, MemoryExtractionContext, MemoryExtractionResult, MemoryRetrievalContext } from "./memoryTypes";
import { MEMORY_EXTRACTION_CAPACITY_ERROR } from "./memoryExtractionCapacity";

async function extractWithCapacityRecovery(context: MemoryExtractionContext, extractApi: MemoryExtractionApi): Promise<MemoryExtractionResult> {
  let calls = 0;
  const boundedApi: MemoryExtractionApi = async params => calls >= 8
    ? { error: "memory_extraction_split_budget_exhausted" }
    : (++calls, await extractApi(params));
  const run = async (messages: MemoryExtractionContext["recentMessages"]): Promise<MemoryExtractionResult> => {
    const result = await extractMemories({ ...context, recentMessages: messages }, boundedApi);
    if (context.singlePass || result.apiError !== MEMORY_EXTRACTION_CAPACITY_ERROR || messages.length < 2) return result;
    const middle = Math.ceil(messages.length / 2);
    const left = await run(messages.slice(0, middle)); if (left.apiError) return left;
    const right = await run(messages.slice(middle)); if (right.apiError) return right;
    return { extractedMemories: [...left.extractedMemories, ...right.extractedMemories], acceptedClaims: [...left.acceptedClaims, ...right.acceptedClaims],
      rejectedCandidateCount: left.rejectedCandidateCount + right.rejectedCandidateCount,
      valueSkippedCount:(left.valueSkippedCount||0)+(right.valueSkippedCount||0),
      structuredCandidatesV2: [...(left.structuredCandidatesV2 || []), ...(right.structuredCandidatesV2 || [])],
      shadowCandidatesV2: [...(left.shadowCandidatesV2 || []), ...(right.shadowCandidatesV2 || [])],
      rejectedCandidates: [...(left.rejectedCandidates || []), ...(right.rejectedCandidates || [])] };
  };
  return run(context.recentMessages);
}

export {
  MEMORY_MODEL_SCHEMA_VERSION,
  MEMORY_SOURCE_POLICIES,
  getMemorySourcePolicy,
  isMemoryRecordCurrentlyActive,
  isMemoryRecordVisibleToRelation,
  memoryRecordScopeKey,
  memoryRecordFromBehaviorCorrection,
  memoryRecordFromConversationSummary,
  memoryRecordFromKnowledgeClaim,
  memoryRecordFromLegacyItem,
  normalizeMemoryRecord,
} from "./memoryModel";
export { DEFAULT_MEMORY_RECALL_CHARACTER_LIMIT, DEFAULT_TRUTH_PROMPT_CHARACTER_LIMIT, normalizeMemoryRecallBudget, selectMemoryItemsWithinBudget, truncatePromptText } from "./memoryRecallPolicy";
export type {
  MemoryLayer,
  MemoryRecord,
  MemoryRecordKind,
  MemoryRecordProvenance,
  MemoryRecordScope,
  MemoryRecordStatus,
  MemoryRecordVisibility,
  MemoryRelationReadScope,
  MemorySourceApp,
  MemorySourceKind,
  MemorySourcePolicy,
} from "./memoryModel";

export { formatDelicateMemoryDiary, formatExtractedMemorySummary, formatMemoriesForPrompt };
export type { MemoryScenario, MemoryExtractionContext, MemoryRetrievalContext } from "./memoryTypes";

export const MemoryService = {
  retrieveRelevantMemories(context: MemoryRetrievalContext): MemoryItem[] {
    return retrieveRelevantMemories(
      context.existingMemories,
      context.characterId,
      context.queryText,
      context.limit,
      context.relationId,
      {
        userIdentityId: context.userIdentityId,
        conversationId: context.conversationId,
        maxCharacters: context.maxCharacters,
        excludeCanonicalMirrors: context.excludeCanonicalMirrors,
      },
    );
  },
  retrieveRelevantMemoriesForScopes(context: {
    existingMemories: readonly MemoryItem[];
    scopes: readonly { characterId: string; relationId: string; userIdentityId?: string }[];
    queryText: string;
    limit?: number;
    maxCharacters?: number;
    excludeCanonicalMirrors?: boolean;
  }): MemoryItem[] {
    return retrieveRelevantMemoriesForScopes(
      context.existingMemories,
      context.scopes,
      context.queryText,
      context.limit,
      { maxCharacters: context.maxCharacters, excludeCanonicalMirrors: context.excludeCanonicalMirrors },
    );
  },
  formatMemoriesForPrompt,
  extractMemories(context: MemoryExtractionContext, extractApi: MemoryExtractionApi) {
    return extractWithCapacityRecovery(context, extractApi);
  },
  async extractMemoryBatches(context: MemoryExtractionContext, extractApi: MemoryExtractionApi, batchSize = 24): Promise<MemoryExtractionResult> {
    const combined: MemoryExtractionResult = { extractedMemories: [], acceptedClaims: [], rejectedCandidateCount: 0 };
    const size = Math.max(1, Math.min(24, Math.floor(batchSize) || 24));
    const originals=new Map(context.recentMessages.map(message=>[message.id,message]));
    const windows=context.scenario==="offline"
      ?context.recentMessages.flatMap(message=>splitOfflineSourceText(message.content).map(content=>({...message,content})))
      :context.recentMessages;
    // Keep fragments of a long entry in separate requests, with its original source ID.
    const batches:(typeof windows[number])[][]=[];
    for(const message of windows){const last=batches[batches.length-1];
      if(!last||last.length>=size||context.scenario==="offline"&&(last.some(previous=>previous.id===message.id)||last.reduce((sum,item)=>sum+item.content.length,0)+message.content.length>12_000))batches.push([message]);
      else last.push(message);
    }
    for (const batch of batches) {
      const result = await extractWithCapacityRecovery({ ...context, existingClaims: evolveKnowledgeClaims(context.existingClaims || [], combined.acceptedClaims),
        recentMessages: batch }, extractApi);
      // The owning caller commits only after every source batch succeeds.
      if (result.apiError) return { ...combined, apiError: result.apiError };
      combined.reviewFailures=[...(combined.reviewFailures||[]),...(result.reviewFailures||[])];
      combined.impressionCandidates=[...(combined.impressionCandidates||[]),...(result.impressionCandidates||[])];
      combined.extractedMemories.push(...result.extractedMemories);
      combined.acceptedClaims.push(...result.acceptedClaims.map(claim=>context.scenario!=="offline"?claim:({...claim,source:{...claim.source,
        messageRevisions:Object.fromEntries((claim.source.messageIds||[]).filter(id=>originals.has(id)).map(id=>[id,sourceRevision(originals.get(id)!.content)]))}})));
      combined.rejectedCandidateCount += result.rejectedCandidateCount;
      combined.valueSkippedCount=(combined.valueSkippedCount||0)+(result.valueSkippedCount||0);
    }
    return combined;
  },
  deduplicateMemories(existingMemories: readonly MemoryItem[], candidate: Pick<MemoryItem, "characterId" | "relationId" | "content">): boolean {
    return isDuplicateMemory(existingMemories, candidate);
  },
  mergeMemories(existingMemories: readonly MemoryItem[], additions: readonly MemoryItem[]): MemoryItem[] {
    return additions.reduce<MemoryItem[]>((merged, addition) => {
      const sourceClaimKey = [...(addition.sourceKnowledgeClaimIds || [])].sort().join("\u0000");
      const repeatsClaimMirror = Boolean(sourceClaimKey) && merged.some((memory) =>
        [...(memory.sourceKnowledgeClaimIds || [])].sort().join("\u0000") === sourceClaimKey);
      if (merged.some((memory) => memory.id === addition.id) || repeatsClaimMirror || isDuplicateMemory(merged, addition)) return merged;
      return [addition, ...merged];
    }, [...existingMemories]);
  },
  prepareMemoriesForScenario(context: MemoryRetrievalContext): MemoryItem[] {
    return this.retrieveRelevantMemories(context);
  },
  hasMarker(existingMemories: readonly MemoryItem[], characterId: string, relationOrMarker: string | undefined, marker?: string): boolean {
    // Keep the legacy three-argument public call compatible while allowing a
    // relation-aware fourth argument for all new direct-chat callers.
    return marker === undefined
      ? isDuplicateMemoryMarker(existingMemories, characterId, undefined, relationOrMarker || "")
      : isDuplicateMemoryMarker(existingMemories, characterId, relationOrMarker, marker);
  },
};
