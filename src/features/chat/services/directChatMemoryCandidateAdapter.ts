import { createId } from "../../../core/id/createId";
import type {
  KnowledgeClaim,
  KnowledgeKind,
  KnowledgeSourceKind,
  KnowledgeSubject,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { MemoryCandidate, MemoryCandidateKind, MemoryCandidateSourceType } from "../../../domain/memory/memoryCandidate";
import type { MemoryExtractionCandidateV2 } from "../../../domain/memory/memoryExtractionSchema";
import type { MemoryExtractionSourceEnvelope } from "../../../domain/memory/memoryExtractionSourceEnvelope";
import type { MemoryExtractionResult } from "../../../domain/memory/memoryTypes";
import { getRuntimeExtractionLineage } from "../../characterKnowledge/services/knowledgeExtractionProtocol";
import {
  bindDirectChatMemorySourceHints,
  resolveDirectChatMemoryActorTarget,
  type DirectChatMemorySourceBinding,
} from "./directChatMemorySourceBinding";
import { resolveMemoryCandidateAuthorityRole } from "../../../domain/memory/memoryAdmission";

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
  /** Runtime recording time for additive V2 metadata; AI does not provide it. */
  recordedAt?: number;
  /** Runtime-owned source universe; when present V2 hints are never trusted directly. */
  sourceEnvelope?: MemoryExtractionSourceEnvelope;
}

export interface DirectChatMemoryCandidateAdapterResult {
  candidates: MemoryCandidate[];
  unsupportedKindCount: number;
  missingSourceReferenceCount: number;
  invalidSourceReferenceCount: number;
  duplicateSourceReferenceCount: number;
  partialSourceReferenceCount: number;
  scopeMismatchCount: number;
  canonicalBindingSuccessCount: number;
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

function roleId(
  role: MemoryExtractionCandidateV2["actorRole"],
  scope: DirectChatMemoryCandidateAdapterScope,
): string | undefined {
  if (role === "user") return normalize(scope.userIdentityId);
  if (role === "character") return normalize(scope.characterId);
  if (role === "relationship") return normalize(scope.relationId);
  return undefined;
}

function actorTargetForV2(
  candidate: MemoryExtractionCandidateV2,
  scope: DirectChatMemoryCandidateAdapterScope,
): { actorId?: string; targetId?: string } {
  const actorId = roleId(candidate.actorRole, scope);
  const targetId = roleId(candidate.targetRole, scope);
  return {
    ...(actorId ? { actorId } : {}),
    ...(targetId ? { targetId } : {}),
  };
}

function subjectForV2(candidate: MemoryExtractionCandidateV2): KnowledgeSubject | undefined {
  return candidate.actorRole === "user" || candidate.actorRole === "character"
    || candidate.actorRole === "relationship" || candidate.actorRole === "other"
    ? candidate.actorRole
    : undefined;
}

function adaptV2Candidate(
  candidate: MemoryExtractionCandidateV2,
  input: DirectChatMemoryCandidateAdapterInput,
  createCandidateId: () => string,
  binding?: DirectChatMemorySourceBinding,
  metadataSource: "legacy" | "v2" = "v2",
): MemoryCandidate {
  const refs = binding ? binding.trustedSourceMessageIds : candidate.sourceMessageIds;
  const sourceConversationId = normalize(input.scope.conversationId);
  const actorTarget = input.sourceEnvelope
    ? resolveDirectChatMemoryActorTarget({
      actorRole: candidate.actorRole,
      targetRole: candidate.targetRole,
      envelope: input.sourceEnvelope,
    })
    : actorTargetForV2(candidate, input.scope);
  const authorship = input.sourceEnvelope && binding ? binding.authorship : "unknown";
  const lineage = input.lineage && (input.lineage.parentActionId || input.lineage.producerActionId || input.lineage.sourceRequestId)
    ? input.lineage
    : undefined;
  const runtimeLineageId = getRuntimeExtractionLineage(candidate);
  const metadataCandidate: MemoryCandidate = {
    schemaVersion: 1,
    candidateId: createCandidateId(),
    candidateKind: candidate.kind,
    metadataSource,
    ...(metadataSource === "v2" ? {
      epistemicStatus: candidate.epistemicStatus || "unknown",
      ...(candidate.kind === "plan" ? { planLifecycle: candidate.planLifecycle || "unknown" } : {}),
      proposedAuthorityRole: candidate.authorityRole || "unknown",
    } : {}),
    ...(candidate.semanticFacet ? { semanticFacet: candidate.semanticFacet } : {}),
    ...(candidate.durability ? { durability: candidate.durability } : {}),
    ...(candidate.relationshipSignalKind ? { relationshipSignalKind: candidate.relationshipSignalKind } : {}),
    statement: candidate.statement,
    ...(subjectForV2(candidate) ? { subject: subjectForV2(candidate) } : {}),
    scope: {
      characterId: normalize(input.scope.characterId) || "",
      relationId: normalize(input.scope.relationId) || "",
      userIdentityId: normalize(input.scope.userIdentityId) || "",
      ...(sourceConversationId ? { conversationId: sourceConversationId } : {}),
    },
    provenance: {
      producer: "direct_chat",
      sourceType: "user_message",
      // AI metadata describes content; it cannot assert who authored it.
      authorship,
      ...actorTarget,
      app: "chat",
      ...(refs.length ? { sourceMessageIds: refs } : {}),
      ...(sourceConversationId ? { conversationId: sourceConversationId } : {}),
    },
    evidence: refs.length ? { sourceMessageIds: refs } : {},
    temporal: {
      status: candidate.temporalStatus,
      ...(candidate.occurredAt !== undefined ? { occurredAt: candidate.occurredAt } : {}),
      recordedAt: input.recordedAt ?? 0,
      ...(candidate.validFrom !== undefined ? { validFrom: candidate.validFrom } : {}),
      ...(candidate.validTo !== undefined ? { validTo: candidate.validTo } : {}),
    },
    ...(candidate.confidence !== undefined ? { confidence: candidate.confidence } : {}),
    ...(candidate.importance !== undefined ? { importance: candidate.importance } : {}),
    ...(lineage ? { lineage } : {}),
    ...(runtimeLineageId ? { runtimeLineageId } : {}),
  };
  if (metadataSource === "v2") {
    metadataCandidate.resolvedAuthorityRole = resolveMemoryCandidateAuthorityRole(metadataCandidate).role;
  }
  return metadataCandidate;
}

/**
 * Map the already-validated normal-chat extraction result to candidates. This
 * function does not parse messages, call AI, read storage, or write memory.
 */
export function adaptDirectChatMemoryExtractionToCandidates(
  input: DirectChatMemoryCandidateAdapterInput,
): DirectChatMemoryCandidateAdapterResult {
  const sourceEnvelope = input.sourceEnvelope || input.extraction.sourceEnvelope;
  const runtimeInput = sourceEnvelope && !input.sourceEnvelope ? { ...input, sourceEnvelope } : input;
  const createCandidateId = runtimeInput.createCandidateId || (() => createId("memory-candidate"));
  const hasStructuredV2 = Boolean(runtimeInput.extraction.structuredCandidatesV2?.length);
  const structuredCandidates = hasStructuredV2
    ? runtimeInput.extraction.structuredCandidatesV2
    : runtimeInput.extraction.shadowCandidatesV2;
  if (structuredCandidates?.length) {
    let unsupportedKindCount = 0;
    let invalidSourceReferenceCount = 0;
    let duplicateSourceReferenceCount = 0;
    let partialSourceReferenceCount = 0;
    let scopeMismatchCount = 0;
    let canonicalBindingSuccessCount = 0;
    let missingSourceReferenceCount = 0;
    const candidates = structuredCandidates.map((candidate) => {
      if (candidate.kind === "unknown") unsupportedKindCount += 1;
      const binding = runtimeInput.sourceEnvelope
        ? bindDirectChatMemorySourceHints({
          envelope: runtimeInput.sourceEnvelope,
          modelSourceHints: candidate.sourceMessageIds,
          expectedScope: runtimeInput.scope,
        })
        : undefined;
      if (binding) {
        invalidSourceReferenceCount += binding.invalidSourceMessageIds.length;
        duplicateSourceReferenceCount += binding.duplicateSourceMessageIds.length;
        if (binding.partialValid) partialSourceReferenceCount += 1;
        if (!binding.scopeMatches) scopeMismatchCount += 1;
        if (binding.status === "valid") canonicalBindingSuccessCount += 1;
      }
      const adapted = adaptV2Candidate(candidate, runtimeInput, createCandidateId, binding, hasStructuredV2 ? "v2" : "legacy");
      if (!adapted.provenance.sourceMessageIds?.length) missingSourceReferenceCount += 1;
      return adapted;
    });
    return {
      candidates,
      unsupportedKindCount,
      missingSourceReferenceCount,
      invalidSourceReferenceCount,
      duplicateSourceReferenceCount,
      partialSourceReferenceCount,
      scopeMismatchCount,
      canonicalBindingSuccessCount,
      // V2 has an explicit kind/facet channel, including scene_only.
      sceneClassificationUnavailableCount: 0,
    };
  }
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
    invalidSourceReferenceCount: 0,
    duplicateSourceReferenceCount: 0,
    partialSourceReferenceCount: 0,
    scopeMismatchCount: 0,
    canonicalBindingSuccessCount: 0,
    // The existing extraction schema has no scene classification field. Do not
    // infer it from statement text; expose the gap for the shadow report.
    sceneClassificationUnavailableCount: candidates.length,
  };
}
