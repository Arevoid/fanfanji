import { createId } from "../../../core/id/createId";
import type {
  KnowledgeClaim,
  KnowledgeKind,
  KnowledgeSourceKind,
  KnowledgeSubject,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { MemoryCandidate, MemoryCandidateKind, MemoryCandidateSourceType } from "../../../domain/memory/memoryCandidate";
import type { MemoryExtractionResult } from "../../../domain/memory/memoryTypes";

export interface DirectChatMemoryCandidateAdapterScope {
  /** These IDs must come from the canonical Direct Chat runtime, never text. */
  characterId?: string;
  relationId?: string;
  userIdentityId?: string;
  conversationId?: string;
}

export interface DirectChatMemoryCandidateAdapterLineage {
  parentActionId?: string;
  producerActionId?: string;
  sourceRequestId?: string;
}

export interface DirectChatMemoryCandidateAdapterInput {
  extraction: MemoryExtractionResult;
  scope: DirectChatMemoryCandidateAdapterScope;
  lineage?: DirectChatMemoryCandidateAdapterLineage;
  /** Tests may inject a deterministic factory; production uses governed createId. */
  createCandidateId?: () => string;
  /** Test/debug-only known keys; no storage scan is performed. */
  knownIdempotencyKeys?: ReadonlySet<string>;
}

export interface DirectChatMemoryCandidateAdapterResult {
  candidates: MemoryCandidate[];
  unsupportedKindCount: number;
  missingSourceReferenceCount: number;
  sceneClassificationUnavailableCount: number;
}

const SOURCE_TYPE_BY_KIND: Readonly<Record<KnowledgeSourceKind, MemoryCandidateSourceType | undefined>> = {
  user_message: "user_message",
  automatic_summary: "automatic_summary",
  deterministic_action: "deterministic_action",
  manual: "manual",
  ooc_correction: undefined,
  offline_story: "offline_story",
  import: "import",
  legacy_memory: "import",
};

const CANDIDATE_KIND_BY_KNOWLEDGE_KIND: Readonly<Record<KnowledgeKind, MemoryCandidateKind>> = {
  fact: "fact",
  preference: "unknown",
  plan: "plan",
  belief: "belief",
  hypothesis: "unknown",
};

const isNonEmpty = (value: string | undefined): value is string => Boolean(value?.trim());
const normalize = (value: string | undefined): string | undefined => isNonEmpty(value) ? value.trim() : undefined;

function actorTargetForSubject(
  subject: KnowledgeSubject,
  scope: DirectChatMemoryCandidateAdapterScope,
): { actorId?: string; targetId?: string } {
  if (subject === "user" && isNonEmpty(scope.userIdentityId) && isNonEmpty(scope.characterId)) {
    return { actorId: scope.userIdentityId.trim(), targetId: scope.characterId.trim() };
  }
  if (subject === "character" && isNonEmpty(scope.characterId) && isNonEmpty(scope.userIdentityId)) {
    return { actorId: scope.characterId.trim(), targetId: scope.userIdentityId.trim() };
  }
  return {};
}

function sourceRefs(claim: KnowledgeClaim): {
  sourceMessageIds?: readonly string[];
  sourceEventIds?: readonly string[];
  sourceRecordIds?: readonly string[];
} {
  return {
    ...(claim.source.messageIds?.length ? { sourceMessageIds: claim.source.messageIds } : {}),
    ...(claim.source.eventId ? { sourceEventIds: [claim.source.eventId] } : {}),
    ...(claim.source.sourceRecordId ? { sourceRecordIds: [claim.source.sourceRecordId] } : {}),
  };
}

/**
 * Map the already-validated normal-chat extraction result to candidates. This
 * function does not parse messages, call AI, read storage, or write memory.
 */
export function adaptDirectChatMemoryExtractionToCandidates(
  input: DirectChatMemoryCandidateAdapterInput,
): DirectChatMemoryCandidateAdapterResult {
  const createCandidateId = input.createCandidateId || (() => createId("memory-candidate"));
  let unsupportedKindCount = 0;
  let missingSourceReferenceCount = 0;
  const candidates = input.extraction.acceptedClaims.map((claim) => {
    const candidateKind = CANDIDATE_KIND_BY_KNOWLEDGE_KIND[claim.kind];
    const sourceType = SOURCE_TYPE_BY_KIND[claim.source.kind];
    const refs = sourceRefs(claim);
    if (candidateKind === "unknown") unsupportedKindCount += 1;
    if (!refs.sourceMessageIds?.length && !refs.sourceEventIds?.length && !refs.sourceRecordIds?.length) {
      missingSourceReferenceCount += 1;
    }
    const actorTarget = actorTargetForSubject(claim.subject, input.scope);
    const sourceConversationId = normalize(input.scope.conversationId);
    const lineage = input.lineage && (input.lineage.parentActionId || input.lineage.producerActionId || input.lineage.sourceRequestId)
      ? input.lineage
      : undefined;
    const candidate: MemoryCandidate = {
      schemaVersion: 1,
      candidateId: createCandidateId(),
      candidateKind: sourceType ? candidateKind : "unknown",
      statement: claim.statement,
      subject: claim.subject,
      scope: {
        characterId: normalize(input.scope.characterId) || "",
        relationId: normalize(input.scope.relationId) || "",
        userIdentityId: normalize(input.scope.userIdentityId) || "",
        ...(normalize(input.scope.conversationId) ? { conversationId: input.scope.conversationId!.trim() } : {}),
      },
      provenance: {
        producer: "direct_chat",
        sourceType: sourceType || "import",
        authorship: claim.source.authorship,
        ...actorTarget,
        app: "chat",
        ...(refs.sourceMessageIds ? { sourceMessageIds: refs.sourceMessageIds } : {}),
        ...(refs.sourceEventIds ? { sourceEventIds: refs.sourceEventIds } : {}),
        ...(refs.sourceRecordIds ? { sourceRecordIds: refs.sourceRecordIds } : {}),
        ...(sourceConversationId ? { conversationId: sourceConversationId } : {}),
      },
      evidence: {
        ...(refs.sourceMessageIds ? { sourceMessageIds: refs.sourceMessageIds } : {}),
        ...(refs.sourceEventIds ? { sourceEventIds: refs.sourceEventIds } : {}),
        ...(refs.sourceRecordIds ? { sourceRecordIds: refs.sourceRecordIds } : {}),
        ...(isNonEmpty(claim.source.evidenceKey) ? { evidenceKey: claim.source.evidenceKey.trim() } : {}),
      },
      temporal: {
        status: claim.temporalStatus,
        ...(claim.occurredAt !== undefined ? { occurredAt: claim.occurredAt } : {}),
        recordedAt: claim.recordedAt,
        ...(claim.validFrom !== undefined ? { validFrom: claim.validFrom } : {}),
        ...(claim.validTo !== undefined ? { validTo: claim.validTo } : {}),
      },
      confidence: claim.confidence,
      ...(claim.importance !== undefined ? { importance: claim.importance } : {}),
      ...(lineage ? { lineage } : {}),
    };
    return candidate;
  });

  return {
    candidates,
    unsupportedKindCount,
    missingSourceReferenceCount,
    // The existing extraction schema has no scene classification field. Do not
    // infer it from statement text; expose the gap for the shadow report.
    sceneClassificationUnavailableCount: candidates.length,
  };
}
