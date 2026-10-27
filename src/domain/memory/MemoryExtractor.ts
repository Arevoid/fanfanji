import {memoryReviewErrorCode,type MemoryReviewFailure} from "./memoryReviewFailure";
import type { MemoryItem, Message } from "../../types";
import type { KnowledgeClaim, KnowledgeWriteCandidate } from "../characterKnowledge/characterKnowledgeTypes";
import { MEMORY_EXTRACTION_CANDIDATE_LIMIT, MEMORY_EXTRACTION_CAPACITY_ERROR, MEMORY_SEMANTIC_REVIEW_BATCH_SIZE } from "./memoryExtractionCapacity";
import { evaluateKnowledgeWrite } from "../characterKnowledge/knowledgeWritePolicy";
import { normalizeExtractedKnowledgeCandidate } from "../../features/characterKnowledge/services/knowledgeExtractionProtocol";
import { isDuplicateMemory } from "./MemoryDeduplicator";
import { deriveKnowledgeSemantics, sourceRevision } from "../characterKnowledge/knowledgeEvolution";
import { groundKnowledgeProposition } from "../characterKnowledge/knowledgeProposition";
import { groundKnowledgeEvent } from "../characterKnowledge/knowledgeEventPolicy";
import { knowledgeAttributeRegistry } from "../characterKnowledge/knowledgeAttributeIdentity";
import { semanticFactRegistry, normalizeSemanticFactDecision } from "../characterKnowledge/semanticFactResolution";
import { assessKnowledgeValue } from "../characterKnowledge/knowledgeValueAssessment";
import { sourceContradictsSemanticReplacement } from "../characterKnowledge/knowledgeSourceConsistency";
import { acceptSemanticTransitionReview, authorizeSemanticTransition, type SemanticTransitionProposal, type SemanticTransitionReview } from "../characterKnowledge/semanticTransitionReview";
import type { MemoryExtractionApi, MemoryExtractionContext, MemoryExtractionResult } from "./memoryTypes";
import { serializeMessageContentForPrompt,getMessageEvidenceAuthor } from "../../features/chat/prompts/messagePromptSerializer";
import { buildMemoryExtractionSourceEnvelope } from "./memoryExtractionSourceEnvelope";
import {
  buildMemoryExtractionLocalSourceRefTable,
  resolveMemoryExtractionSourceRefs,
} from "./memoryExtractionLocalSourceRefs";
import {
  copyRuntimeExtractionLineage,
} from "../../features/characterKnowledge/services/knowledgeExtractionProtocol";
import type {
  MemoryExtractionCandidateV2,
  MemoryExtractionRejectionDiagnostic,
} from "./memoryExtractionSchema";
import { buildMemoryShadowCorrelationKey } from "./memoryShadowCorrelation";

const hasTruthScope = (context: MemoryExtractionContext): boolean => Boolean(
  context.relationId?.trim()
  && context.userIdentityId?.trim()
  && context.conversationId?.trim(),
);

const createEvidenceKey = (relationId: string, sourceIds: readonly string[], statement: string): string =>
  [relationId, ...sourceIds.slice().sort(), statement.trim().replace(/\s+/gu, " ").toLocaleLowerCase()].join("\u0000");

const isMessage = (value: Message | undefined): value is Message => Boolean(value);

/**
 * Providers sometimes normalize line endings or collapse spaces while
 * returning JSON. Keep the provenance requirement strict, but compare a
 * whitespace-normalized form as a compatibility fallback after the exact
 * match fails.
 */
const normalizeEvidenceText = (value: string): string => value
  .replace(/\r\n?/gu, "\n")
  .replace(/[ \t\u00a0]+/gu, " ")
  .trim();

const containsEvidence = (source: string, quote: string): boolean => {
  if (source.includes(quote)) return true;
  const normalizedSource = normalizeEvidenceText(source);
  const normalizedQuote = normalizeEvidenceText(quote);
  return Boolean(normalizedQuote) && normalizedSource.includes(normalizedQuote);
};

/**
 * Correlation is based on source references and temporal status, never array position or
 * statement text. The token is opaque to shadow consumers and is not exported.
 */
const candidateCorrelationKey = (input: {
  sourceMessageIds: readonly string[];
  temporalStatus: string;
}): string | undefined => {
  return buildMemoryShadowCorrelationKey(input.sourceMessageIds, input.temporalStatus);
};

const candidateKindForLegacyKind = (
  kind: KnowledgeWriteCandidate["kind"],
): MemoryExtractionCandidateV2["kind"] => {
  switch (kind) {
    case "fact": return "fact";
    case "plan": return "plan";
    case "belief": return "belief";
    case "preference": return "fact";
    case "hypothesis": return "belief";
    default: return "unknown";
  }
};

const shadowCandidateFromPayload = (
  payload: {
    statement: string;
    kind: KnowledgeWriteCandidate["kind"];
    subject: KnowledgeWriteCandidate["subject"];
    temporalStatus: KnowledgeWriteCandidate["temporalStatus"];
    sourceMessageIds: readonly string[];
    evidenceQuote: string;
  },
): MemoryExtractionCandidateV2 => {
  const candidate: MemoryExtractionCandidateV2 = {
    schemaVersion: 2,
    kind: candidateKindForLegacyKind(payload.kind),
    ...(payload.kind === "preference" ? { semanticFacet: "preference", durability: "unknown" as const } : {}),
    ...(payload.kind === "hypothesis" ? { semanticFacet: "hypothesis" } : {}),
    epistemicStatus: payload.kind === "belief" || payload.kind === "hypothesis" ? "uncertain" : "unknown",
    ...(payload.kind === "plan" ? { planLifecycle: "unknown" as const } : {}),
    statement: payload.statement,
    temporalStatus: payload.temporalStatus,
    sourceMessageIds: payload.sourceMessageIds,
    evidenceQuote: payload.evidenceQuote,
    actorRole: payload.subject === "user" || payload.subject === "character" || payload.subject === "relationship" || payload.subject === "other"
      ? payload.subject
      : undefined,
  };
  copyRuntimeExtractionLineage(payload, candidate);
  return candidate;
};

const diagnostic = (input: Omit<MemoryExtractionRejectionDiagnostic, "decision"> & {
  decision: MemoryExtractionRejectionDiagnostic["decision"];
}): MemoryExtractionRejectionDiagnostic => ({
  ...input,
  ...(input.correlationKey ? { correlationKey: input.correlationKey } : {}),
});

export async function extractMemories(
  context: MemoryExtractionContext,
  extractApi: MemoryExtractionApi,
): Promise<MemoryExtractionResult> {
  const sourceEnvelope = buildMemoryExtractionSourceEnvelope({
    characterId: context.characterId,
    relationId: context.relationId,
    userIdentityId: context.userIdentityId,
    conversationId: context.conversationId,
    recentMessages: context.recentMessages,
    parentActionId: context.parentActionId,
    extractionActionId: context.extractionActionId,
  });
  let structuredOutputTelemetry: import("../../core/monitoring/structuredOutputTelemetryTypes").StructuredOutputTelemetry | undefined;
  let valueSkippedCount=0;
  let reviewFailures:MemoryReviewFailure[]=[];
  const withSourceEnvelope = (result: Omit<MemoryExtractionResult, "sourceEnvelope">): MemoryExtractionResult => ({
    ...result,
    valueSkippedCount,
    ...(reviewFailures.length?{reviewFailures}:{}),
    sourceEnvelope,
    ...(structuredOutputTelemetry ? { structuredOutputTelemetry } : {}),
  });
  const usesLocalSourceRefs = context.scenario === "chat";
  const localSourceRefTable = usesLocalSourceRefs
    ? buildMemoryExtractionLocalSourceRefTable(sourceEnvelope)
    : undefined;
  const history = context.recentMessages.map((message) => ({
    id: localSourceRefTable?.refs.find((source) => source.messageId === message.id)?.ref || message.id,
    role: message.sender === "user" ? "user" as const : "model" as const,
    text: context.scenario === "offline" ? message.content : serializeMessageContentForPrompt(message, {
      mode: "history",
      characterName: context.character.name,
    }),
  }));
  const registryScope = hasTruthScope(context) ? { characterId: context.characterId, relationId: context.relationId!, userIdentityId: context.userIdentityId!, conversationId: context.conversationId } : undefined;
  const registryQuery = context.recentMessages.map((message) => message.content).join(" ");
  let preparedIds: readonly { id: string }[] = [];
  try { preparedIds = context.singlePass?[]:await context.prepareSemanticRegistry?.(registryQuery) || []; } catch { /* Conservative local registry remains available. */ }
  const localRegistry = registryScope ? semanticFactRegistry(context.existingClaims || [], registryScope, registryQuery) : [];
  const semanticRegistry = registryScope ? [...preparedIds.flatMap(({ id }) => {
    const record = (context.existingClaims || []).find((claim) => claim.id === id);
    return record ? semanticFactRegistry([record], registryScope, registryQuery) : [];
  }), ...localRegistry].filter((record, index, records) => records.findIndex((other) => other.id === record.id) === index).slice(0, 48) : [];
  const extractionParams: Parameters<MemoryExtractionApi>[0] = {
    singlePass:context.singlePass,memorySettings:context.memorySettings,
    history,
    characterName: context.character.name,
    characterProfile: [
      context.character.personality,
      context.character.backstory,
      ...(context.character.references || []).map((reference) => `${reference.title}：${reference.content}`),
    ].filter(Boolean).join("\n").slice(0, 6000),
    apiKey: context.apiKey,
    streamCompatible:context.streamCompatible,
    semanticRegistry,
    knownAttributes: context.relationId && context.userIdentityId && context.conversationId ? knowledgeAttributeRegistry(context.existingClaims || [],
      { characterId: context.characterId, relationId: context.relationId, userIdentityId: context.userIdentityId, conversationId: context.conversationId },
      context.recentMessages.map((message) => message.content).join(" ")) : [],
    model: context.model,
    knownActivities: hasTruthScope(context) ? [...new Set((context.existingClaims || []).filter((claim) => claim.characterId === context.characterId
      && claim.relationId === context.relationId && claim.userIdentityId === context.userIdentityId && claim.conversationId === context.conversationId
      && claim.status === "active" && claim.event).map((claim) => claim.event!.activity))].slice(0, 64) : [],
    apiEndpoint: context.apiEndpoint,
    // Archive style is a presentation preference, never extraction authority.
    templateType: "refined",
    ...(usesLocalSourceRefs ? { sourceReferenceMode: "local" as const } : {}),
    characterId: context.characterId,
    relationId: context.relationId,
    conversationId: context.conversationId,
    parentActionId: context.parentActionId,
    ...(context.enableMemoryExtractionV2Shadow ? { enableV2Shadow: true } : {}),
    ...(context.scenario === "offline" ? { scenario: "offline" as const } : {}),
  };
  const data = await extractApi(extractionParams);
  structuredOutputTelemetry = data.structuredOutputTelemetry;
  const resolveModelSourceRefs = <T extends { sourceMessageIds?: readonly string[] }>(candidate: T): T => {
    if (!localSourceRefTable || !Array.isArray(candidate.sourceMessageIds)) return candidate;
    const resolution = resolveMemoryExtractionSourceRefs(candidate.sourceMessageIds, localSourceRefTable);
    if (resolution.invalidRefs.length !== 0) return candidate;
    const resolved = { ...candidate, sourceMessageIds: resolution.canonicalMessageIds };
    copyRuntimeExtractionLineage(candidate, resolved);
    return resolved;
  };
  const structuredCandidatesV2 = Array.isArray(data.structuredCandidatesV2) && data.structuredCandidatesV2.length > 0
    ? data.structuredCandidatesV2.map(resolveModelSourceRefs)
    : undefined;

  // API adapters return an empty array alongside their error so callers can
  // keep a stable response shape. Preserve the error before interpreting that
  // empty array as an honest "no durable facts" extraction.
  if (data.error) {
    try { context.onFailedResponse?.(data); } catch { /* Diagnostics cannot change extraction behavior. */ }
    return withSourceEnvelope({
      extractedMemories: [],
      acceptedClaims: [],
      rejectedCandidateCount: 0,
      rejectedCandidates: [],
      apiError: data.error,
    });
  }

  const initialRawItems = Array.isArray(data.candidates) ? data.candidates : data.items;
  if (!Array.isArray(initialRawItems)) {
    return withSourceEnvelope({
      extractedMemories: [],
      acceptedClaims: [],
      rejectedCandidateCount: 0,
      ...(structuredCandidatesV2 ? { structuredCandidatesV2 } : {}),
      rejectedCandidates: [],
      ...(structuredCandidatesV2 ? {} : { apiError: data.error || "提炼失败，未提取到有效记忆或API请求出错" }),
    });
  }

  let rawItems:unknown[]=initialRawItems;
  // An empty first pass is independently audited before an existing factual
  // registry can silently keep an obsolete value. No candidate is fabricated.
  if(!context.singlePass&&context.requireFactResolution&&semanticRegistry.length&&rawItems.length===0){
    const sources=history.filter(item=>item.role==='user'&&item.text.trim()).map((item,index)=>({index,statement:item.text,currentText:item.text,recoverCandidate:true,sourceMessageIds:[item.id]}));
    const recovered:unknown[]=[];
    for(let offset=0;offset<sources.length;offset+=MEMORY_SEMANTIC_REVIEW_BATCH_SIZE)try{
      const batch=sources.slice(offset,offset+MEMORY_SEMANTIC_REVIEW_BATCH_SIZE);
      const result=await extractApi({...extractionParams,identityReview:batch,enableV2Shadow:false});
      if(result.error||!Array.isArray(result.identityReviews))throw Error('empty_review_unavailable');
      for(const source of batch){
        const matches=result.identityReviews.filter(raw=>raw&&typeof raw==='object'&&(raw as {index?:unknown}).index===source.index) as {candidate?:unknown}[];
        if(matches.length!==1||!Object.prototype.hasOwnProperty.call(matches[0],'candidate'))throw Error('empty_review_incomplete');
        if(matches[0].candidate!==null){
          const candidate=matches[0].candidate as Record<string,unknown>;
          if(!candidate||typeof candidate!=='object'||!Array.isArray(candidate.sourceMessageIds)||!candidate.sourceMessageIds.length
            ||candidate.sourceMessageIds.some(id=>!source.sourceMessageIds.includes(id))||typeof candidate.evidenceQuote!=='string'
            ||!source.currentText.includes(candidate.evidenceQuote)||!normalizeExtractedKnowledgeCandidate(candidate,new Set(source.sourceMessageIds)))throw Error('empty_review_source_mismatch');
          recovered.push(candidate);
        }
      }
    }catch{return withSourceEnvelope({extractedMemories:[],acceptedClaims:[],rejectedCandidateCount:0,apiError:'semantic_identity_unavailable'});}
    rawItems=recovered;
  }
  const resolvedRawItems = usesLocalSourceRefs
    ? rawItems.map((item) => item && typeof item === "object" && !Array.isArray(item)
      ? resolveModelSourceRefs(item as { sourceMessageIds?: readonly string[] } & Record<string, unknown>)
      : item)
    : rawItems;
  // Saturation cannot prove that later facts were covered. The service splits
  // this source range; a single saturated source remains explicitly pending.
  if (rawItems.length >= MEMORY_EXTRACTION_CANDIDATE_LIMIT) return withSourceEnvelope({
    extractedMemories: [], acceptedClaims: [], rejectedCandidateCount: 0, apiError: MEMORY_EXTRACTION_CAPACITY_ERROR,
  });
  const collectDiagnostics = context.enableAdmissionShadowObservation === true;

  // A memory without a complete relationship scope cannot be attributed to a
  // specific user's relationship. Keep the result visible to the caller as a
  // rejected extraction, but never manufacture a legacy long-term MemoryItem.
  // This closes the old characterId-only fallback that could leak facts across
  // identities or conversations.
  if (!hasTruthScope(context)) {
    const rejectedCandidates = collectDiagnostics ? rawItems.map((item) => {
      const sourceMessageIds = item && typeof item === "object" && !Array.isArray(item)
        && Array.isArray((item as Record<string, unknown>).sourceMessageIds)
        ? ((item as Record<string, unknown>).sourceMessageIds as unknown[]).filter((id): id is string => typeof id === "string")
        : [];
      return diagnostic({
        decision: "rejected",
        stage: "knowledge_gate",
        reason: "insufficient_scope",
        sourceMessageCount: sourceMessageIds.length,
      });
    }) : undefined;
    return withSourceEnvelope({
      extractedMemories: [],
      acceptedClaims: [],
      rejectedCandidateCount: rawItems.length,
      ...(structuredCandidatesV2 ? { structuredCandidatesV2 } : {}),
      ...(rejectedCandidates ? { rejectedCandidates } : {}),
    });
  }

  const allowedMessageIds = new Set(context.recentMessages.map((message) => message.id));
  const parserDiagnostics: MemoryExtractionRejectionDiagnostic[] = [];
  const payloadEntries = resolvedRawItems
    .map((item, index) => ({ item, index, payload: normalizeExtractedKnowledgeCandidate(item, allowedMessageIds) }))
    .filter((entry): entry is typeof entry & { payload: NonNullable<typeof entry.payload> } => {
      if (entry.payload) {
        copyRuntimeExtractionLineage(entry.item && typeof entry.item === "object" ? entry.item : undefined, entry.payload);
        return true;
      }
      const sourceMessageIds = entry.item && typeof entry.item === "object" && !Array.isArray(entry.item)
        && Array.isArray((entry.item as Record<string, unknown>).sourceMessageIds)
        ? ((entry.item as Record<string, unknown>).sourceMessageIds as unknown[]).filter((id): id is string => typeof id === "string")
        : [];
      if (collectDiagnostics) parserDiagnostics.push(diagnostic({
        decision: "incomparable",
        stage: "parser",
        reason: "candidate_unavailable",
        sourceMessageCount: sourceMessageIds.length,
      }));
      return false;
    })
    ; // Every valid candidate is evaluated; batching bounds the input instead of silently losing the tail.
  const payloads = payloadEntries.map((entry) => entry.payload);
  if(!context.singlePass&&context.requireFactResolution&&semanticRegistry.length){
    const missing=payloadEntries.flatMap(({payload,index})=>{
      const sources=context.recentMessages.filter(m=>payload.sourceMessageIds.includes(m.id));
      return (!payload.factDecision||['new','uncertain'].includes(payload.factDecision.operation))&&['fact','preference'].includes(payload.kind)&&sources.length&&sources.every(m=>getMessageEvidenceAuthor(m,payload.evidenceQuote)==='user')
        ?[{index,statement:payload.statement,currentText:sources.map(m=>serializeMessageContentForPrompt(m,{mode:'history',characterName:context.character.name})).join('\n')}]:[];
    });
    for(let offset=0;offset<missing.length;offset+=MEMORY_SEMANTIC_REVIEW_BATCH_SIZE){
      const batch=missing.slice(offset,offset+MEMORY_SEMANTIC_REVIEW_BATCH_SIZE);
      try{
        const result=await extractApi({...extractionParams,identityReview:batch,enableV2Shadow:false});
        if(result.error||!Array.isArray(result.identityReviews))throw Error('identity_review_unavailable');
        for(const item of batch){
          const matches=result.identityReviews.filter(raw=>raw&&typeof raw==='object'&&(raw as {index?:unknown}).index===item.index) as {factDecision?:unknown}[];
          const decision=matches.length===1?normalizeSemanticFactDecision(matches[0].factDecision):undefined;
          if(!decision||!item.currentText.includes(decision.currentQuote)||!decision.currentQuote.includes(decision.value)
            ||decision.operation!=='new'&&decision.operation!=='uncertain'&&!semanticRegistry.some(record=>record.id===decision.targetClaimId))throw Error('identity_review_incomplete');
          payloadEntries.find(entry=>entry.index===item.index)!.payload.factDecision=decision;
        }
      }catch{return withSourceEnvelope({extractedMemories:[],acceptedClaims:[],rejectedCandidateCount:0,apiError:'semantic_identity_unavailable'});}
    }
  }
  const proposals: SemanticTransitionProposal[] = payloadEntries.flatMap(({ payload, index }) => {
    const source = context.recentMessages.filter((message) => payload.sourceMessageIds.includes(message.id));
    const confirmedOffline = context.scenario === "offline" && context.offlineStoryPolicyInput?.userConfirmed === true;
    if (!source.length || !confirmedOffline && source.some((message) => getMessageEvidenceAuthor(message,payload.evidenceQuote) !== "user")) return [];
    const scopedTarget = (id: string | undefined) => (context.existingClaims || []).find((claim) => claim.id === id
      && claim.characterId === context.characterId && claim.relationId === context.relationId && claim.userIdentityId === context.userIdentityId
      && claim.conversationId === context.conversationId && claim.status === "active" && !claim.recallDisabled && !claim.supersededById);
    const currentText = source.map((message) => confirmedOffline ? `[${message.sender === "user" ? "用户" : context.character.name}] ${message.content}` : message.content).join("\n");
    const fact = payload.factDecision; const factTarget = scopedTarget(fact?.targetClaimId);
    const event = payload.event; const eventTarget = scopedTarget(event?.referenceClaimId);
    return [...(fact && factTarget && !["new", "uncertain"].includes(fact.operation) ? [{ index: index * 2, previousId: factTarget.id,
      previousText: factTarget.source.evidenceQuote || factTarget.statement, currentText, type: "fact" as const, operation: fact.operation, value: fact.value }] : []),
    ...(event && (eventTarget?.event || !event.referenceClaimId) ? [{ index: index * 2 + 1,
      previousId: eventTarget?.id || `new-event:${index}`, previousText: eventTarget ? eventTarget.source.evidenceQuote || eventTarget.statement : currentText,
      currentText, type: "event" as const, operation: event.state, value: event.activity }] : [])];
  });
  const reviewed = new Set<number>();
  const reviewEvidence = new Map<number, SemanticTransitionReview>();
  let reviewUnavailable = false;
  for (let offset = 0; !context.singlePass&&offset < proposals.length; offset += MEMORY_SEMANTIC_REVIEW_BATCH_SIZE) try {
    const batch = proposals.slice(offset, offset + MEMORY_SEMANTIC_REVIEW_BATCH_SIZE);
    const result = await extractApi({ ...extractionParams, semanticReview: batch, enableV2Shadow: false });
    if (result.error || !Array.isArray(result.semanticReviews)) reviewUnavailable = true;
    for (const proposal of batch) {
      const matches = result.semanticReviews?.filter((item) => item && typeof item === "object" && (item as { index?: unknown }).index === proposal.index) || [];
      if (matches.length !== 1) reviewUnavailable = true;
      const accepted = !result.error && matches.length === 1 ? acceptSemanticTransitionReview(matches[0], proposal) : undefined;
      if (accepted) { reviewed.add(proposal.index); reviewEvidence.set(proposal.index, accepted); }
    }
  } catch { reviewUnavailable = true; }
  const filteredStatements = context.filterItems
    ? new Set(context.filterItems(payloads.map((item) => item.statement)))
    : undefined;
  const baseId = context.createId();
  const acceptedClaims: KnowledgeClaim[] = [];
  const impressionCandidates: unknown[] = [];
  const displayTextByClaimId = new Map<string, string>();
  const legacyDiagnostics: MemoryExtractionRejectionDiagnostic[] = [...parserDiagnostics];
  const diagnosticForPayload = (
    payload: NonNullable<typeof payloadEntries[number]["payload"]>,
    input: Omit<MemoryExtractionRejectionDiagnostic, "decision"> & {
      decision: MemoryExtractionRejectionDiagnostic["decision"];
    },
  ): MemoryExtractionRejectionDiagnostic => {
    const next = diagnostic(input);
    copyRuntimeExtractionLineage(payload, next);
    return next;
  };
  let rejectedCandidateCount = rawItems.length - payloads.length;

  payloadEntries.forEach(({ payload, index }) => {
    const correlationKey = candidateCorrelationKey(payload);
    const sourceMessageCount = payload.sourceMessageIds.length;
    if (filteredStatements && !filteredStatements.has(payload.statement)) {
      rejectedCandidateCount += 1;
      if (collectDiagnostics) legacyDiagnostics.push(diagnosticForPayload(payload, {
        decision: "rejected",
        stage: "knowledge_gate",
        reason: "filtered",
        candidateKind: candidateKindForLegacyKind(payload.kind),
        sourceMessageCount,
        temporalStatus: payload.temporalStatus,
        correlationKey,
      }));
      return;
    }
    const sourceMessages = payload.sourceMessageIds
      .map((id) => context.recentMessages.find((message) => message.id === id))
      .filter(isMessage);
    const quotedMessage = sourceMessages.find((message) =>
      containsEvidence(message.content, payload.evidenceQuote)
      || containsEvidence(serializeMessageContentForPrompt(message, {
        mode: "history",
        characterName: context.character.name,
      }), payload.evidenceQuote));
    if (!quotedMessage) {
      rejectedCandidateCount += 1;
      if (collectDiagnostics) legacyDiagnostics.push(diagnosticForPayload(payload, {
        decision: "rejected",
        stage: "knowledge_gate",
        reason: "evidence_not_found",
        candidateKind: candidateKindForLegacyKind(payload.kind),
        sourceMessageCount,
        temporalStatus: payload.temporalStatus,
        correlationKey,
      }));
      return;
    }
    const isVerifiedUserEvidence = Boolean(quotedMessage
      && getMessageEvidenceAuthor(quotedMessage,payload.evidenceQuote) === "user"
      && sourceMessages.every((message) => getMessageEvidenceAuthor(message,payload.evidenceQuote) === "user"));
    const ownExperience = payload.experience && payload.subject === "character" && payload.kind === "belief"
      && payload.temporalStatus !== "future" && quotedMessage.sender === "character"
      && sourceMessages.every(message => message.sender === "character" && (!message.senderId || message.senderId === context.characterId)) ? payload.experience : undefined;
    if (payload.experience && !ownExperience) { rejectedCandidateCount++; return; }
    // A confirmed offline continuation is summarized into explicit named
    // subjects. Replacing it with the raw quote here would re-introduce "我/你"
    // and can reverse who did what when the memory is recalled later.
    const useNormalizedOfflineStatement = context.scenario === "offline"
      && context.offlineStoryPolicyInput?.userConfirmed === true;
    const statement = useNormalizedOfflineStatement
      ? payload.statement
      : isVerifiedUserEvidence ? payload.evidenceQuote : payload.statement;
    if (context.filterItems && context.filterItems([statement]).length === 0) {
      rejectedCandidateCount += 1;
      if (collectDiagnostics) legacyDiagnostics.push(diagnosticForPayload(payload, {
        decision: "rejected",
        stage: "knowledge_gate",
        reason: "filtered",
        candidateKind: candidateKindForLegacyKind(payload.kind),
        sourceMessageCount,
        temporalStatus: payload.temporalStatus,
        correlationKey,
      }));
      return;
    }
    const sourceKind = context.scenario === "offline" ? "offline_story" as const : "user_message" as const;
    const writeCandidate: KnowledgeWriteCandidate = {
      id: `claim:${baseId}:${index}`,
      relationId: context.relationId!,
      characterId: context.characterId,
      userIdentityId: context.userIdentityId!,
      conversationId: context.conversationId!,
      kind: payload.kind,
      subject: payload.subject,
      statement: ownExperience ? ownExperience.reflection : statement,
      temporalStatus: payload.temporalStatus,
      source: {
        kind: ownExperience && context.scenario !== "offline" ? "automatic_summary" : sourceKind,
        authorship: ownExperience ? "character" : isVerifiedUserEvidence ? "user" : "unknown",
        ...(ownExperience ? { experience: ownExperience, app: context.scenario === "offline" ? "offline" as const : "chat" as const } : {}),
        messageIds: payload.sourceMessageIds,
        quotedMessageId: quotedMessage.id,
        messageAuthors: Object.fromEntries(sourceMessages.filter((message) => message.sender === "user" || message.sender === "character")
          .flatMap((message) => {const author=getMessageEvidenceAuthor(message,payload.evidenceQuote);return author==="unknown"?[]:[[message.id,author]];})),
        evidenceGroups: [payload.sourceMessageIds],
        messageRevisions: Object.fromEntries(sourceMessages.map((message) => [message.id, sourceRevision(message.content)])),
        statementAt: quotedMessage.timestamp,
        evidenceQuote: payload.evidenceQuote,
        ...(payload.sourceInterpretation ? { interpretation: payload.sourceInterpretation } : {}),
        ...(context.offlineStoryPolicyInput ? { storyId: context.offlineStoryPolicyInput.story.id } : {}),
        producer: `memory-extractor.${context.scenario}.v1`,
        evidenceKey: createEvidenceKey(context.relationId!, payload.sourceMessageIds, statement),
      },
      confidence: ownExperience ? .5 : useNormalizedOfflineStatement ? 0.9 : isVerifiedUserEvidence ? 0.85 : 0.4,
      userConfirmed: !ownExperience && context.scenario === "offline" && context.offlineStoryPolicyInput?.userConfirmed === true,
      recordedAt: context.currentTime(),
      // Fictional chronology is independent of the wall-clock message timestamp.
      ...(payload.temporalStatus === "present" && context.scenario !== "offline" ? { occurredAt: quotedMessage.timestamp } : {}),
      offlineStoryPolicyInput: context.offlineStoryPolicyInput,
    };
    const decision = evaluateKnowledgeWrite(writeCandidate);
    if (decision.accepted) {
      const value = assessKnowledgeValue(decision.claim, payload.valueAssessment);
      if (!value.retain) { rejectedCandidateCount += 1;valueSkippedCount++; return; }
      decision.claim = value.claim;
      if(!ownExperience&&context.singlePass&&context.memorySettings?.length){
        const review=payload.settingReview,setting=context.memorySettings.find(s=>s.id===review?.settingId);
        const valid=review&&Number.isFinite(review.confidence)&&review.confidence>=.8&&review.confidence<=1&&Boolean(review.reason?.trim());
        const exactDuplicate=valid&&review.decision==="duplicate_setting"&&review.confidence>=.95&&setting&&review.settingQuote?.trim()
          &&setting.text.includes(review.settingQuote)&&setting.text.includes(statement)&&["present","timeless"].includes(payload.temporalStatus)&&!payload.event;
        if(exactDuplicate){valueSkippedCount++;return;}
        if(!valid||review.decision!=="new_experience")decision.claim={...decision.claim,admissionStatus:"review",coreCandidate:false,valueReason:"单次整理未能明确判断与设定的关系，保留原文"};
      }
      decision.claim.semantics = ownExperience ? undefined : deriveKnowledgeSemantics(decision.claim) || groundKnowledgeProposition(payload.proposition, decision.claim);
      const eventReview = reviewEvidence.get(index * 2 + 1);
      const event = payload.event?.referenceClaimId && eventReview ? { ...payload.event, referenceQuote: eventReview.previousQuote,
        matchReason: eventReview.reason, matchConfidence: eventReview.confidence } : payload.event;
      decision.claim.event = ownExperience ? undefined : groundKnowledgeEvent(event, decision.claim, context.existingClaims || [], context.singlePass ? undefined : reviewed.has(index * 2 + 1));
      // A failed ancillary event proposal must not invalidate an independently
      // verified attribute change. The unverified event itself stays absent.
      const verifiedFactTransition = reviewed.has(index * 2)
        && ["fact", "preference"].includes(payload.kind)
        && ["change", "correction", "duplicate"].includes(payload.factDecision?.operation || "");
      if (verifiedFactTransition) decision.claim.event = undefined;
      if (payload.event && !decision.claim.event && !verifiedFactTransition) {
        decision.claim.resolutionStatus = "review"; decision.claim.resolutionReason = "事件对象或生命周期尚未通过独立来源核对";
        decision.claim.truthStatus = "disputed";
      }
      const factReview = reviewEvidence.get(index * 2);
      // The quote remains verbatim. A separately grounded review may resolve
      // the keyword guard's false future classification, never its conditional guard.
      if (factReview?.effectiveNow === true && ["fact", "preference"].includes(payload.kind)
        && (["present", "timeless"].includes(payload.temporalStatus) || payload.temporalStatus==="past"&&["change","correction"].includes(factReview.operation))
        && ["change", "correction", "duplicate"].includes(factReview.operation)
        && (decision.adjustments.includes("future_to_plan")||payload.temporalStatus==="past") && !decision.adjustments.includes("conditional_to_hypothesis")) {
        decision.claim.kind = payload.kind;
        decision.claim.temporalStatus = payload.temporalStatus==="past"?"present":payload.temporalStatus;
      }
      decision.claim.factDecision = ownExperience ? undefined : payload.factDecision && factReview ? { ...payload.factDecision,
        previousQuote: factReview.previousQuote, currentQuote: factReview.currentQuote } : payload.factDecision;
      // Explicit first-person attributes have their own narrow source-grounded
      // policy. A model-supplied, unreviewed entity judgment must not intercept it.
      if (context.singlePass && isVerifiedUserEvidence && deriveKnowledgeSemantics(decision.claim)) {
        decision.claim.factDecision = undefined;
      }
      const target = !ownExperience && (context.existingClaims || []).find((claim) => claim.id === payload.factDecision?.targetClaimId
        && claim.characterId === context.characterId && claim.relationId === context.relationId && claim.userIdentityId === context.userIdentityId && claim.conversationId === context.conversationId);
      if (target && payload.factDecision && sourceContradictsSemanticReplacement(target, payload.factDecision, sourceMessages.map((message) => message.content))) {
        decision.claim.factDecision = { ...payload.factDecision, operation: "uncertain", reason: "同一来源明确保留旧值，不能将其他对象的新值覆盖到此对象；需核对主体" };
      }
      decision.claim.continuityVersion = 1;
      if (target && reviewed.has(index * 2)) authorizeSemanticTransition(decision.claim, target);
      acceptedClaims.push(decision.claim);
      if (payload.impression && !ownExperience && payload.subject === "user") {
        impressionCandidates.push({ ...payload.impression, sourceClaimIds: [decision.claim.id] });
      }
      if (collectDiagnostics) legacyDiagnostics.push(diagnosticForPayload(payload, {
        decision: "accepted",
        stage: "knowledge_gate",
        reason: "accepted",
        candidateKind: candidateKindForLegacyKind(payload.kind),
        sourceMessageCount,
        temporalStatus: payload.temporalStatus,
        correlationKey,
      }));
      displayTextByClaimId.set(
        decision.claim.id,
        decision.claim.statement,
      );
    } else {
      rejectedCandidateCount += 1;
      if (collectDiagnostics) legacyDiagnostics.push(diagnosticForPayload(payload, {
        decision: "rejected",
        stage: "knowledge_gate",
        reason: `knowledge_write_${"reason" in decision ? decision.reason : "rejected"}`,
        candidateKind: candidateKindForLegacyKind(payload.kind),
        sourceMessageCount,
        temporalStatus: payload.temporalStatus,
        correlationKey,
      }));
    }
  });

  const shadowCandidatesV2 = context.enableAdmissionShadowObservation
    ? payloads.map(shadowCandidateFromPayload)
    : undefined;
  if (reviewUnavailable) return withSourceEnvelope({ extractedMemories: [], acceptedClaims, rejectedCandidateCount,
    apiError: "semantic_review_unavailable", ...(collectDiagnostics ? { rejectedCandidates: legacyDiagnostics } : {}) });

  const subjectiveExperiences = acceptedClaims.filter(claim => claim.source.experience);
  const claimsForSettingsReview = acceptedClaims.filter(claim => !claim.source.experience);
  if (!context.singlePass&&context.reviewAuthorizedSettings && claimsForSettingsReview.length) {
    try {
      const reviewed = await context.reviewAuthorizedSettings(claimsForSettingsReview);
      reviewFailures=reviewed.failures||[];
      acceptedClaims.splice(0, acceptedClaims.length, ...reviewed.claims, ...subjectiveExperiences);
      rejectedCandidateCount += reviewed.skipped;
      valueSkippedCount += reviewed.skipped;
    } catch (error) {
      reviewFailures=[{candidateIds:acceptedClaims.map(claim=>claim.id),code:memoryReviewErrorCode(error)}];
      // Preserve evidence without granting formal recall when the independent
      // setting comparison cannot be completed.
      claimsForSettingsReview.forEach(claim => { claim.admissionStatus = "review"; claim.coreCandidate = false; });
    }
  }

  // The old Memory UI remains a compatibility view. Only trusted user or
  // deterministic claims may be dual-written; inferred AI output stays solely
  // in Truth storage and cannot re-enter legacy prompts as a fact.
  const trustedClaims = acceptedClaims.filter((claim) =>
    (claim.admissionStatus===undefined||claim.admissionStatus==="retained")&&(claim.truthStatus === "asserted" || claim.truthStatus === "confirmed"),
  );
  if (trustedClaims.length === 0) {
    return withSourceEnvelope({
      extractedMemories: [],
      acceptedClaims,
      impressionCandidates,
      rejectedCandidateCount,
      ...(structuredCandidatesV2 ? { structuredCandidatesV2 } : {}),
      ...(shadowCandidatesV2 ? { shadowCandidatesV2 } : {}),
      ...(collectDiagnostics ? { rejectedCandidates: legacyDiagnostics } : {}),
    });
  }

  const candidate: MemoryItem = {
    id: baseId,
    characterId: context.characterId,
    relationId: context.relationId,
    ...(context.userIdentityId ? { userIdentityId: context.userIdentityId } : {}),
    ...(context.conversationId ? { conversationId: context.conversationId } : {}),
    content: context.formatContent(
      trustedClaims.map((claim) => claim.statement),
      { displayItems: trustedClaims.map((claim) => displayTextByClaimId.get(claim.id) || claim.statement) },
    ),
    timestamp: context.currentTime(),
    importance: context.scenario === "offline" ? 4 : 5,
    isManual: false,
    sourceKnowledgeClaimIds: trustedClaims.map((claim) => claim.id),
  };
  return isDuplicateMemory(context.existingMemories, candidate)
    ? withSourceEnvelope({
      extractedMemories: [],
      acceptedClaims,
      impressionCandidates,
      rejectedCandidateCount,
      ...(structuredCandidatesV2 ? { structuredCandidatesV2 } : {}),
      ...(shadowCandidatesV2 ? { shadowCandidatesV2 } : {}),
      ...(collectDiagnostics ? { rejectedCandidates: legacyDiagnostics } : {}),
    })
    : withSourceEnvelope({
      extractedMemories: [candidate],
      acceptedClaims,
      impressionCandidates,
      rejectedCandidateCount,
      ...(structuredCandidatesV2 ? { structuredCandidatesV2 } : {}),
      ...(shadowCandidatesV2 ? { shadowCandidatesV2 } : {}),
      ...(collectDiagnostics ? { rejectedCandidates: legacyDiagnostics } : {}),
    });
}
