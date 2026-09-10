import type { MemoryItem, Message } from "../../types";
import type { KnowledgeClaim, KnowledgeWriteCandidate } from "../characterKnowledge/characterKnowledgeTypes";
import { evaluateKnowledgeWrite } from "../characterKnowledge/knowledgeWritePolicy";
import { normalizeExtractedKnowledgeCandidate } from "../../features/characterKnowledge/services/knowledgeExtractionProtocol";
import { isDuplicateMemory } from "./MemoryDeduplicator";
import type { MemoryExtractionApi, MemoryExtractionContext, MemoryExtractionResult } from "./memoryTypes";
import { serializeMessageContentForPrompt } from "../../features/chat/prompts/messagePromptSerializer";
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
  const withSourceEnvelope = (result: Omit<MemoryExtractionResult, "sourceEnvelope">): MemoryExtractionResult => ({
    ...result,
    sourceEnvelope,
  });
  const usesLocalSourceRefs = context.scenario === "chat";
  const localSourceRefTable = usesLocalSourceRefs
    ? buildMemoryExtractionLocalSourceRefTable(sourceEnvelope)
    : undefined;
  const history = context.recentMessages.map((message) => ({
    id: localSourceRefTable?.refs.find((source) => source.messageId === message.id)?.ref || message.id,
    role: message.sender === "user" ? "user" as const : "model" as const,
    text: serializeMessageContentForPrompt(message, {
      mode: "history",
      characterName: context.character.name,
    }),
  }));
  const data = await extractApi({
    history,
    characterName: context.character.name,
    characterProfile: [
      context.character.personality,
      context.character.backstory,
      ...(context.character.references || []).map((reference) => `${reference.title}：${reference.content}`),
    ].filter(Boolean).join("\n").slice(0, 6000),
    apiKey: context.apiKey,
    model: context.model,
    apiEndpoint: context.apiEndpoint,
    templateType: context.templateType,
    ...(usesLocalSourceRefs ? { sourceReferenceMode: "local" as const } : {}),
    characterId: context.characterId,
    relationId: context.relationId,
    conversationId: context.conversationId,
    parentActionId: context.parentActionId,
    ...(context.enableMemoryExtractionV2Shadow ? { enableV2Shadow: true } : {}),
    ...(context.scenario === "offline" ? { scenario: "offline" as const } : {}),
  });
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
    return withSourceEnvelope({
      extractedMemories: [],
      acceptedClaims: [],
      rejectedCandidateCount: 0,
      rejectedCandidates: [],
      apiError: data.error,
    });
  }

  const rawItems = Array.isArray(data.candidates) ? data.candidates : data.items;
  if (!Array.isArray(rawItems)) {
    return withSourceEnvelope({
      extractedMemories: [],
      acceptedClaims: [],
      rejectedCandidateCount: 0,
      ...(structuredCandidatesV2 ? { structuredCandidatesV2 } : {}),
      rejectedCandidates: [],
      ...(structuredCandidatesV2 ? {} : { apiError: data.error || "提炼失败，未提取到有效记忆或API请求出错" }),
    });
  }

  const resolvedRawItems = usesLocalSourceRefs
    ? rawItems.map((item) => item && typeof item === "object" && !Array.isArray(item)
      ? resolveModelSourceRefs(item as { sourceMessageIds?: readonly string[] } & Record<string, unknown>)
      : item)
    : rawItems;
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
    .slice(0, context.scenario === "offline" ? 8 : 5);
  const payloads = payloadEntries.map((entry) => entry.payload);
  const filteredStatements = context.filterItems
    ? new Set(context.filterItems(payloads.map((item) => item.statement)))
    : undefined;
  const baseId = context.createId();
  const acceptedClaims: KnowledgeClaim[] = [];
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
      && quotedMessage.sender === "user"
      && sourceMessages.every((message) => message.sender === "user"));
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
      statement,
      temporalStatus: payload.temporalStatus,
      source: {
        kind: sourceKind,
        authorship: isVerifiedUserEvidence ? "user" : "unknown",
        messageIds: payload.sourceMessageIds,
        ...(context.offlineStoryPolicyInput ? { storyId: context.offlineStoryPolicyInput.story.id } : {}),
        producer: `memory-extractor.${context.scenario}.v1`,
        evidenceKey: createEvidenceKey(context.relationId!, payload.sourceMessageIds, statement),
      },
      confidence: useNormalizedOfflineStatement ? 0.9 : isVerifiedUserEvidence ? 0.85 : 0.4,
      userConfirmed: context.scenario === "offline" && context.offlineStoryPolicyInput?.userConfirmed === true,
      recordedAt: context.currentTime(),
      offlineStoryPolicyInput: context.offlineStoryPolicyInput,
    };
    const decision = evaluateKnowledgeWrite(writeCandidate);
    if (decision.accepted) {
      acceptedClaims.push(decision.claim);
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
        context.templateType === "delicate" && payload.memoryText
          ? payload.memoryText
          : decision.claim.statement,
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

  // The old Memory UI remains a compatibility view. Only trusted user or
  // deterministic claims may be dual-written; inferred AI output stays solely
  // in Truth storage and cannot re-enter legacy prompts as a fact.
  const trustedClaims = acceptedClaims.filter((claim) =>
    claim.truthStatus === "asserted" || claim.truthStatus === "confirmed",
  );
  if (trustedClaims.length === 0) {
    return withSourceEnvelope({
      extractedMemories: [],
      acceptedClaims,
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
      rejectedCandidateCount,
      ...(structuredCandidatesV2 ? { structuredCandidatesV2 } : {}),
      ...(shadowCandidatesV2 ? { shadowCandidatesV2 } : {}),
      ...(collectDiagnostics ? { rejectedCandidates: legacyDiagnostics } : {}),
    })
    : withSourceEnvelope({
      extractedMemories: [candidate],
      acceptedClaims,
      rejectedCandidateCount,
      ...(structuredCandidatesV2 ? { structuredCandidatesV2 } : {}),
      ...(shadowCandidatesV2 ? { shadowCandidatesV2 } : {}),
      ...(collectDiagnostics ? { rejectedCandidates: legacyDiagnostics } : {}),
    });
}
