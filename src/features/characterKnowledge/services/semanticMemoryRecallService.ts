import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { asksForHistory, isHistoricalKnowledgeVersion, sourceRevision } from "../../../domain/characterKnowledge/knowledgeEvolution";
import { isKnowledgeTemporallyActive } from "../../../domain/characterKnowledge/knowledgeTemporalPolicy";
import { isSemanticMemoryIndex, normalizeEmbeddingVector, scoreSemanticMemories, semanticClaimRevision, semanticIndexFailure, type SemanticMemoryIndex } from "../../../domain/memory/semanticMemoryIndex";
import { loadSemanticMemoryIndex, saveSemanticMemoryIndex } from "../../../core/storage/repositories/semanticMemoryIndexRepository";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { readJson, writeJson } from "../../../core/storage/storageAdapter";
import { canWriteMemoryStorage } from "../../../core/storage/memoryWriterCoordination";
import { getMemoryReadMode } from "../../../core/storage/repositories/memoryReadPolicyRepository";
import { createAiRequestLedgerSession } from "../../../core/monitoring/aiRequestLedger";
import { filterRecallableKnowledge } from "./characterContinuityService";
import { contributeDirectReplyTruthContext, type DirectReplyTruthContextInput } from "./directReplyTruthContextContributor";
import { requestMemoryEmbeddings, type MemoryEmbeddingConfiguration } from "./memoryEmbeddingProvider";
import { supplementarySemanticDocuments } from "./semanticMemoryDocuments";
import { loadCharacterContinuity } from "../../../core/storage/repositories/characterContinuityRepository";
import { loadConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { chunkSemanticDocument, semanticDocumentScore, isIndexableSemanticClaim } from "../../../domain/memory/semanticMemoryDocuments";
import { inferMemoryQueryConstraints, memoryQueryMatchingIds } from "../../../domain/memory/memoryQueryConstraints";
import { projectKnowledgeReadFrame } from "../../../domain/characterKnowledge/knowledgeReadFrame";
import { knowledgeSearchText } from "../../../domain/memory/knowledgeSearchText";
import { projectCharacterContinuityReadFrame } from "../../../domain/memory/characterContinuity";
import {memoryCacheGeneration,onMemoryCacheInvalidated} from "../../../core/storage/memoryCacheInvalidation";
import {observeMemoryMentions} from "./memoryMentionService";
import {loadCommittedMemoryReplyTurns} from "./memoryReplySources";

const BUDGET_KEY = "phone_memory_semantic_budget_v1";
interface Budget { day: string; indexRequests: number; queryRequests: number; characters: number }
const queryCache = new Map<string, number[]>();
const inFlight = new Map<string, Promise<Awaited<ReturnType<typeof contributeSemanticDirectReplyTruthContextUnlocked>>>>();
onMemoryCacheInvalidated(()=>{queryCache.clear();inFlight.clear();});
export const MEMORY_SEMANTIC_DAILY_LIMITS = { indexRequests: 64, queryRequests: 128, characters: 2_000_000 } as const;
export function memorySemanticLimits(configuration?:MemoryEmbeddingConfiguration){
 const limit=(value:number|undefined,fallback:number,max:number)=>Number.isInteger(value)&&value!>0&&value!<=max?value!:fallback;
 return {indexRequests:limit(configuration?.indexRequestsPerDay,64,10000),queryRequests:limit(configuration?.queryRequestsPerDay,128,10000),characters:limit(configuration?.charactersPerDay,2_000_000,100_000_000)};
}
export const memoryVectorProviderId = (configuration: MemoryEmbeddingConfiguration) => JSON.stringify([
  new URL(configuration.apiEndpoint).origin + new URL(configuration.apiEndpoint).pathname, configuration.model]);
interface Input {
  indexOnly?: boolean;
  queryOnly?: boolean;
  retrieval: DirectReplyTruthContextInput; configuration?: MemoryEmbeddingConfiguration; visible?: boolean; now?: number;
  request?: typeof requestMemoryEmbeddings;
  signal?: AbortSignal;
  readIndex?: typeof loadSemanticMemoryIndex; writeIndex?: typeof saveSemanticMemoryIndex;
  readClaims?: () => readonly KnowledgeClaim[];
}
function localDay(now: number) { const date = new Date(now); return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`; }
function reserveBudget(input: Input, kind: "indexRequests" | "queryRequests", characters: number): boolean {
  const now = input.now ?? Date.now(); const day = localDay(now);
  if(kind==="indexRequests"&&input.configuration?.indexPaused)return false;
  const limits=memorySemanticLimits(input.configuration);
  const read = readJson<Record<string, Budget>>(BUDGET_KEY, {});
  if (!read.valid || !read.value || Array.isArray(read.value)) return false;
  const key = JSON.stringify([input.retrieval.scope.characterId, input.retrieval.scope.userIdentityId]);
  const current = read.value[key]?.day === day ? read.value[key] : { day, indexRequests: 0, queryRequests: 0, characters: 0 };
  if (![current.indexRequests, current.queryRequests, current.characters].every((value) => Number.isInteger(value) && value >= 0)
    || current[kind] >= limits[kind] || current.characters + characters > limits.characters) return false;
  return writeJson(BUDGET_KEY, { ...Object.fromEntries(Object.entries(read.value).filter(([, value]) => value.day === day)),
    [key]: { ...current, [kind]: current[kind] + 1, characters: current.characters + characters } }).success;
}
async function embed(input: Input, texts: readonly string[], kind: "indexRequests" | "queryRequests"): Promise<number[][]> {
  input.signal?.throwIfAborted();
  if (input.visible === undefined && typeof document !== "undefined" && document.visibilityState !== "visible") throw new Error("embedding_not_visible");
  const configuration = input.configuration!;
  const characters = texts.reduce((sum, text) => sum + text.length, 0);
  if (!reserveBudget(input, kind, characters)) throw new Error("embedding_budget_limited");
  const scope = input.retrieval.scope;
  const ledger = createAiRequestLedgerSession({ purpose: "memory_embedding", contextItems: [kind],
    model: configuration.model, inputCharacters: characters, estimatedInputTokens: Math.ceil(characters / 2),
    characterId: scope.characterId, relationId: scope.relationId, conversationId: scope.conversationId });
  try {
    ledger.markAttempt({ provider: "custom-openai-compatible", model: configuration.model, endpoint: configuration.apiEndpoint });
    const rows = await (input.request || requestMemoryEmbeddings)({ configuration, texts, signal: input.signal,
      onUsage: (usage) => ledger.recordUsage(usage) });
    const normalized = rows.map(normalizeEmbeddingVector);
    if (normalized.length !== texts.length || normalized.some((vector) => !vector)
      || normalized.some((vector) => vector!.length !== normalized[0]!.length)) throw new Error("invalid_embedding_vectors");
    ledger.complete({ succeeded: true, outputCharacters: 0 });
    return normalized as number[][];
  } catch (error) { ledger.complete({ succeeded: false, outputCharacters: 0, error: "memory_embedding_failed" }); throw error; }
}
export async function contributeSemanticDirectReplyTruthContext(input: Input) {
  input = { ...input, queryOnly: input.queryOnly || input.retrieval.knownAt !== undefined,
    retrieval: { ...input.retrieval, claims: projectKnowledgeReadFrame(input.retrieval.claims, input.retrieval.knownAt) } };
  const key = JSON.stringify([memoryCacheGeneration(),input.retrieval.scope,input.retrieval.mentionChannel,input.retrieval.mentionNow,input.retrieval.recentAssistantTurns, input.configuration?.apiEndpoint, input.configuration?.model, input.retrieval.queryText,
    input.indexOnly, input.queryOnly, getMemoryReadMode(input.retrieval.scope.userIdentityId), input.retrieval.knownAt, input.retrieval.queryConstraints, input.retrieval.scenario,
    input.retrieval.limit, input.retrieval.maxCharacters, input.retrieval.maxTokens, input.retrieval.alreadyPromptedMessageIds, input.retrieval.alreadyPromptedTexts,
    input.retrieval.continuitySnapshot ? sourceRevision(JSON.stringify(input.retrieval.continuitySnapshot)) : undefined]);
  const previous = inFlight.get(key); if (previous) return previous;
  const run = () => contributeSemanticDirectReplyTruthContextUnlocked(input);
  const task = typeof navigator !== "undefined" && navigator.locks?.request
    ? navigator.locks.request(`fanfanji:semantic-memory:${JSON.stringify([input.retrieval.scope.characterId, input.retrieval.scope.userIdentityId])}`, run)
    : run();
  inFlight.set(key, task);
  try { return await task; } finally { inFlight.delete(key); }
}
async function contributeSemanticDirectReplyTruthContextUnlocked(input: Input) {
  const generation=memoryCacheGeneration();
  const writeIndex=async(index:SemanticMemoryIndex)=>{if(generation!==memoryCacheGeneration())throw Error("memory_cache_invalidated");await (input.writeIndex||saveSemanticMemoryIndex)(index);};
  const visible = input.visible ?? (typeof document !== "undefined" && document.visibilityState === "visible");
  const fallback = () => {
    const latest = input.readClaims?.() || (typeof window === "undefined" ? input.retrieval.claims : loadKnowledgeClaims().value);
    return contributeDirectReplyTruthContext({ ...input.retrieval, claims: [...latest] });
  };
  const configuration = input.configuration;
  const mentionNow=input.retrieval.mentionChannel?.startsWith("offline:")?input.retrieval.mentionNow??input.now??Date.now():input.now??Date.now();
  const mentionChannel=input.retrieval.mentionChannel||"conversation";
  const mayObserve=typeof window!=="undefined"&&visible&&!input.indexOnly&&canWriteMemoryStorage("phone_memory_mentions_v1")&&(!input.retrieval.scenario||input.retrieval.scenario==="private")
    &&(input.retrieval.knownAt===undefined||mentionChannel.startsWith("offline:")&&input.retrieval.mentionNow!==undefined);
  const mentionTurns=mayObserve?(await loadCommittedMemoryReplyTurns(input.retrieval.scope,mentionChannel,mentionNow)||[]):[];
  const mentionClaims=()=>{const claims=filterRecallableKnowledge(input.retrieval.claims),store=input.retrieval.continuitySnapshot?{valid:true,value:input.retrieval.continuitySnapshot}:loadCharacterContinuity();
    return [...claims,...(store.valid?supplementarySemanticDocuments(input.retrieval.scope,claims,loadConversationSummaries().value,store.value,input.retrieval.knownAt??mentionNow):[])];};
  if(mentionTurns.length)observeMemoryMentions({scope:input.retrieval.scope,claims:mentionClaims(),turns:mentionTurns,now:mentionNow,channel:mentionChannel});
  const query = input.retrieval.queryText?.trim().slice(0, 200) || "";
  if (getMemoryReadMode(input.retrieval.scope.userIdentityId)==="compatibility" || !canWriteMemoryStorage("phone_memory_semantic_index") || !visible || !configuration?.enabled || !configuration.apiKey || !configuration.model || !input.indexOnly && query.length < 3
    || input.retrieval.scenario && input.retrieval.scenario !== "private") return fallback();
  const now = input.retrieval.knownAt ?? input.now ?? Date.now(); const historical = asksForHistory(query);
  const constraints = input.retrieval.queryConstraints || inferMemoryQueryConstraints(query, input.retrieval.claims.filter((claim) => isExactTruthScope(claim, input.retrieval.scope)));
  const queryMatchingIds = memoryQueryMatchingIds(input.retrieval.claims.filter((claim) => isExactTruthScope(claim, input.retrieval.scope)), constraints);
  const allowed = (claim: KnowledgeClaim) => isExactTruthScope(claim, input.retrieval.scope) && !claim.recallDisabled
    && queryMatchingIds.has(claim.id)
    && (isKnowledgeTemporallyActive(claim, now) && !claim.supersededById
      || historical && isHistoricalKnowledgeVersion(claim));
  const indexable = (claim: KnowledgeClaim) => isIndexableSemanticClaim(claim, input.retrieval.scope, now);
  const documents = (current: readonly KnowledgeClaim[], latest = false, recallOnly = false) => {
    const claims = filterRecallableKnowledge(projectKnowledgeReadFrame(current, input.retrieval.knownAt));
    const store = input.retrieval.continuitySnapshot ? { valid: true, value: input.retrieval.continuitySnapshot } : loadCharacterContinuity();
    const summaries = latest && typeof window !== "undefined" && !input.retrieval.continuitySnapshot ? loadConversationSummaries().value : input.retrieval.summaries;
    return [...claims.filter(recallOnly ? allowed : indexable).flatMap((claim) => chunkSemanticDocument(claim, "claim")), ...(store.valid
      ? supplementarySemanticDocuments(input.retrieval.scope, claims, summaries, projectCharacterContinuityReadFrame(store.value, input.retrieval.knownAt), now, !recallOnly || historical).flatMap((claim) => chunkSemanticDocument(claim, "supplementary")) : [])];
  };
  const claims = documents(input.retrieval.claims);
  let activeIndex: SemanticMemoryIndex | undefined;
  try {
    input = { ...input, signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000) };
    const provider = memoryVectorProviderId(configuration);
    let index = await (input.readIndex || loadSemanticMemoryIndex)(input.retrieval.scope, provider);
    if (!isSemanticMemoryIndex(index, input.retrieval.scope, provider)) throw new Error("semantic_index_scope_mismatch");
    const fingerprints = new Map(index.entries.map((entry) => [entry.claimId, entry.revision]));
    const missing = claims.filter((claim) => fingerprints.get(claim.id) !== semanticClaimRevision(claim) && claim.statement.length <= 1900)
      .sort((a, b) => Number(Boolean(b.coreMemory)) - Number(Boolean(a.coreMemory)) || (b.importance ?? 4) - (a.importance ?? 4) || a.recordedAt - b.recordedAt);
    const liveIds = new Set(claims.map((claim) => claim.id));
    index = { ...index, entries: index.entries.filter((entry) => liveIds.has(entry.claimId)),
      pending: missing.map((claim) => ({ claimId: claim.id, revision: semanticClaimRevision(claim) })), updatedAt: now,
      state: missing.length ? "pending" : "ready", failureCode: undefined };
    if (!input.queryOnly) await writeIndex(index);
    activeIndex = index;
    if (!claims.length) return fallback();
    for (let offset = 0; !input.queryOnly && offset < missing.length && offset < 64; offset += 64) {
      const batch = missing.slice(offset, offset + 64);
      let vectors: number[][];
      try { vectors = await embed(input, batch.map((claim) => `[${claim.kind}/${claim.temporalStatus}/${claim.truthStatus}] ${knowledgeSearchText(claim).slice(0, 1900)}`), "indexRequests"); }
      catch (error) {
        const limited = error instanceof Error && error.message === "embedding_budget_limited";
        index = { ...index, state: limited ? "limited" : "failed", failureCode: limited ? undefined : semanticIndexFailure(error) };
        await writeIndex(index); activeIndex = index; break;
      }
      const additions = batch.map((claim, position) => ({ claimId: claim.id, revision: semanticClaimRevision(claim), vector: vectors[position] }));
      const ids = new Set(additions.map((entry) => entry.claimId));
      index = { ...index, entries: [...index.entries.filter((entry) => !ids.has(entry.claimId)), ...additions],
        pending: index.pending?.filter((entry) => !ids.has(entry.claimId)) };
      index.state = index.pending?.length ? "pending" : "ready";
      await writeIndex(index);
      activeIndex = index;
    }
    if (input.indexOnly) return {...fallback(),indexHasMore:index.state==="pending"&&Boolean(index.pending?.length)};
    const cacheKey = JSON.stringify([provider, input.retrieval.scope, query]);
    const replyKeys=mentionTurns.map(turn=>JSON.stringify([provider,input.retrieval.scope,mentionChannel,"actual-assistant",turn.id,sourceRevision(turn.text)]));
    let vector = queryCache.get(cacheKey);
    const replyVectors=replyKeys.map(key=>queryCache.get(key));
    if (!vector||replyVectors.some(v=>!v)) {
      const missingReplies=replyVectors.flatMap((v,i)=>v?[]:[i]);
      const texts=[...(!vector?[query]:[]),...missingReplies.map(i=>mentionTurns[i].text.slice(0,1200))];
      const vectors=await embed(input,texts,"queryRequests");let position=0;
      if(!vector)vector=vectors[position++];
      if(generation!==memoryCacheGeneration())return fallback();
      if (queryCache.size >= 200) queryCache.delete(queryCache.keys().next().value!);
      queryCache.set(cacheKey, vector);
      for(const i of missingReplies){replyVectors[i]=vectors[position++];queryCache.set(replyKeys[i],replyVectors[i]!);}
      while(queryCache.size>200)queryCache.delete(queryCache.keys().next().value!);
    }
    if(mentionTurns.length&&generation===memoryCacheGeneration()){
      const actual=await loadCommittedMemoryReplyTurns(input.retrieval.scope,mentionChannel,mentionNow);
      const unchanged=mentionTurns.flatMap((turn,i)=>actual?.some(current=>current.id===turn.id&&sourceRevision(current.text)===sourceRevision(turn.text))?[i]:[]);
      if(unchanged.length)observeMemoryMentions({scope:input.retrieval.scope,claims:mentionClaims(),turns:unchanged.map(i=>mentionTurns[i]),now:mentionNow,channel:mentionChannel,index,vectors:unchanged.map(i=>replyVectors[i]!) });
    }
    // A source changed while indexing: stale vectors never contribute a score.
    const currentClaims = input.readClaims?.() || (typeof window === "undefined" ? input.retrieval.claims : loadKnowledgeClaims().value);
    const latest = documents(currentClaims, true, true);
    const currentFrame = projectKnowledgeReadFrame(currentClaims, input.retrieval.knownAt);
    let scoringIndex = index;
    if (input.retrieval.knownAt !== undefined) {
      const rawChunks = new Map(currentClaims.filter((claim) => isExactTruthScope(claim, input.retrieval.scope)).flatMap((claim) => chunkSemanticDocument(claim, "claim")).map((claim) => [claim.id, claim]));
      const framedChunks = new Map(latest.map((claim) => [claim.id, claim]));
      scoringIndex = { ...index, entries: index.entries.map((entry) => {
        const raw = rawChunks.get(entry.claimId); const framed = framedChunks.get(entry.claimId);
        return raw && framed && raw.statement === framed.statement && entry.revision === semanticClaimRevision(raw)
          ? { ...entry, revision: semanticClaimRevision(framed) } : entry;
      }) };
    }
    const scores = scoreSemanticMemories(latest, scoringIndex, vector, configuration.minimumSimilarity);
    const semanticScores = new Map<string, number>(); const supplementarySemanticScores = new Map<string, number>(); const claimExcerpts = new Map<string, string>();
    for (const claim of filterRecallableKnowledge(currentFrame).filter(allowed)) {
      const best = semanticDocumentScore(claim, "claim", scores);
      if (best.score > 0) { semanticScores.set(claim.id, best.score); if (claim.statement.length > 600) claimExcerpts.set(claim.id, best.excerpt); }
    }
    const currentStore = input.retrieval.continuitySnapshot ? { valid: true, value: input.retrieval.continuitySnapshot } : loadCharacterContinuity();
    if (currentStore.valid) for (const record of supplementarySemanticDocuments(input.retrieval.scope, filterRecallableKnowledge(currentClaims),
      typeof window !== "undefined" && !input.retrieval.continuitySnapshot ? loadConversationSummaries().value : input.retrieval.summaries, currentStore.value, now, historical)) {
      const best = semanticDocumentScore(record, "supplementary", scores); if (best.score > 0) supplementarySemanticScores.set(record.id, best.score);
    }
    return contributeDirectReplyTruthContext({ ...input.retrieval, claims: [...currentClaims], semanticScores, supplementarySemanticScores, claimExcerpts });
  } catch (error) {
    if (activeIndex && !input.queryOnly) {
      try { await writeIndex({ ...activeIndex,
        state: error instanceof Error && error.message === "embedding_budget_limited" ? "limited" : "failed",
        failureCode: error instanceof Error && error.message === "embedding_budget_limited" ? undefined : semanticIndexFailure(error) }); } catch { /* Retrieval remains available through lexical matching. */ }
    }
    return fallback();
  }
}
