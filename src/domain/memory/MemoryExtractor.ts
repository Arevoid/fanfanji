import type { MemoryItem, Message } from "../../types";
import type { KnowledgeClaim, KnowledgeWriteCandidate } from "../characterKnowledge/characterKnowledgeTypes";
import { evaluateKnowledgeWrite } from "../characterKnowledge/knowledgeWritePolicy";
import { normalizeExtractedKnowledgeCandidate } from "../../features/characterKnowledge/services/knowledgeExtractionProtocol";
import { isDuplicateMemory } from "./MemoryDeduplicator";
import type { MemoryExtractionApi, MemoryExtractionContext, MemoryExtractionResult } from "./memoryTypes";

const hasTruthScope = (context: MemoryExtractionContext): boolean => Boolean(
  context.relationId?.trim()
  && context.userIdentityId?.trim()
  && context.conversationId?.trim(),
);

const createEvidenceKey = (relationId: string, sourceIds: readonly string[], statement: string): string =>
  [relationId, ...sourceIds.slice().sort(), statement.trim().replace(/\s+/gu, " ").toLocaleLowerCase()].join("\u0000");

const isMessage = (value: Message | undefined): value is Message => Boolean(value);

export async function extractMemories(
  context: MemoryExtractionContext,
  extractApi: MemoryExtractionApi,
): Promise<MemoryExtractionResult> {
  const history = context.recentMessages.map((message) => ({
    id: message.id,
    role: message.sender === "user" ? "user" as const : "model" as const,
    text: message.content,
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
    ...(context.scenario === "offline" ? { scenario: "offline" as const } : {}),
  });

  const rawItems = Array.isArray(data.candidates) ? data.candidates : data.items;
  if (!Array.isArray(rawItems)) {
    return {
      extractedMemories: [],
      acceptedClaims: [],
      rejectedCandidateCount: 0,
      apiError: data.error || "提炼失败，未提取到有效记忆或API请求出错",
    };
  }

  // Compatibility-only path for callers that predate a complete relationship
  // scope. Production direct writes pass all scope fields and use Truth Policy.
  if (!hasTruthScope(context)) {
    const validItems = rawItems
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    const acceptedItems = context.filterItems ? context.filterItems(validItems) : validItems;
    if (acceptedItems.length === 0) return { extractedMemories: [], acceptedClaims: [], rejectedCandidateCount: 0 };
    const candidate: MemoryItem = {
      id: context.createId(),
      characterId: context.characterId,
      ...(context.relationId ? { relationId: context.relationId } : {}),
      content: context.formatContent(acceptedItems),
      timestamp: context.currentTime(),
      importance: context.scenario === "offline" ? 4 : 5,
      isManual: false,
    };
    return isDuplicateMemory(context.existingMemories, candidate)
      ? { extractedMemories: [], acceptedClaims: [], rejectedCandidateCount: 0 }
      : { extractedMemories: [candidate], acceptedClaims: [], rejectedCandidateCount: 0 };
  }

  const allowedMessageIds = new Set(context.recentMessages.map((message) => message.id));
  const payloads = rawItems
    .map((item) => normalizeExtractedKnowledgeCandidate(item, allowedMessageIds))
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .slice(0, context.scenario === "offline" ? 8 : 5);
  const filteredStatements = context.filterItems
    ? new Set(context.filterItems(payloads.map((item) => item.statement)))
    : undefined;
  const baseId = context.createId();
  const acceptedClaims: KnowledgeClaim[] = [];
  const displayTextByClaimId = new Map<string, string>();
  let rejectedCandidateCount = rawItems.length - payloads.length;

  payloads.forEach((payload, index) => {
    if (filteredStatements && !filteredStatements.has(payload.statement)) {
      rejectedCandidateCount += 1;
      return;
    }
    const sourceMessages = payload.sourceMessageIds
      .map((id) => context.recentMessages.find((message) => message.id === id))
      .filter(isMessage);
    const quotedMessage = sourceMessages.find((message) => message.content.includes(payload.evidenceQuote));
    if (!quotedMessage) {
      rejectedCandidateCount += 1;
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
      displayTextByClaimId.set(
        decision.claim.id,
        context.templateType === "delicate" && payload.memoryText
          ? payload.memoryText
          : decision.claim.statement,
      );
    }
    else rejectedCandidateCount += 1;
  });

  // The old Memory UI remains a compatibility view. Only trusted user or
  // deterministic claims may be dual-written; inferred AI output stays solely
  // in Truth storage and cannot re-enter legacy prompts as a fact.
  const trustedClaims = acceptedClaims.filter((claim) =>
    claim.truthStatus === "asserted" || claim.truthStatus === "confirmed",
  );
  if (trustedClaims.length === 0) return { extractedMemories: [], acceptedClaims, rejectedCandidateCount };

  const candidate: MemoryItem = {
    id: baseId,
    characterId: context.characterId,
    relationId: context.relationId,
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
    ? { extractedMemories: [], acceptedClaims, rejectedCandidateCount }
    : { extractedMemories: [candidate], acceptedClaims, rejectedCandidateCount };
}
