import type {
  KnowledgeSourceAuthorship,
  KnowledgeSubject,
  TemporalStatus,
} from "../characterKnowledge/characterKnowledgeTypes";
import type { MemorySourceApp } from "./memoryModel";

export const MEMORY_CANDIDATE_SCHEMA_VERSION = 1 as const;

/**
 * A candidate describes a possible durable memory without implying that it
 * should be written.  Candidate kind is an intake classification, not a
 * replacement for the canonical MemoryRecord/KnowledgeClaim kind.
 */
export type MemoryCandidateKind =
  | "fact"
  | "event"
  | "plan"
  | "belief"
  | "episodic"
  | "relationship_signal"
  | "scene_only"
  | "subjective_reflection"
  | "unknown";

export type MemoryCandidateProducer =
  | "direct_chat"
  | "group_chat"
  | "offline"
  | "manual"
  | "diary"
  | "moments"
  | "reading"
  | "inner_voice"
  | "character_phone"
  | "proactive"
  | "cinema"
  | "forum";

export type MemoryCandidateSourceType =
  | "user_message"
  | "automatic_summary"
  | "deterministic_action"
  | "manual"
  | "offline_story"
  | "feature_record"
  | "event"
  | "import";

export interface MemoryCandidateScope {
  characterId: string;
  relationId: string;
  userIdentityId: string;
  /** Optional record scope; absence never means all conversations. */
  conversationId?: string;
}

/**
 * Provenance is intentionally made from identifiers and classifications.  It
 * must not contain a prompt, a response body, or an exception message.
 */
export interface MemoryCandidateProvenance {
  producer: MemoryCandidateProducer;
  sourceType: MemoryCandidateSourceType;
  authorship: KnowledgeSourceAuthorship;
  app?: MemorySourceApp;
  sourceMessageIds?: readonly string[];
  sourceEventIds?: readonly string[];
  sourceRecordIds?: readonly string[];
  /** Source conversation is distinct from optional candidate record scope. */
  conversationId?: string;
}

export interface MemoryCandidateEvidence {
  sourceMessageIds?: readonly string[];
  sourceEventIds?: readonly string[];
  sourceRecordIds?: readonly string[];
  /** Stable local evidence slot; never raw message or prompt content. */
  evidenceKey?: string;
}

export interface MemoryCandidateTemporal {
  status: TemporalStatus;
  occurredAt?: number;
  recordedAt: number;
  validFrom?: number;
  validTo?: number;
}

export interface MemoryCandidateLineage {
  parentActionId?: string;
  producerActionId?: string;
  /** Existing AI request id, when a producer has one. */
  sourceRequestId?: string;
}

export interface MemoryCandidate {
  schemaVersion: typeof MEMORY_CANDIDATE_SCHEMA_VERSION;
  /** Producer-issued opaque identity; generation is outside this contract. */
  candidateId: string;
  candidateKind: MemoryCandidateKind;
  statement: string;
  subject?: KnowledgeSubject;
  scope: MemoryCandidateScope;
  provenance: MemoryCandidateProvenance;
  evidence: MemoryCandidateEvidence;
  temporal: MemoryCandidateTemporal;
  confidence?: number;
  /** Retrieval/consolidation signal only; it is not authority. */
  importance?: number;
  lineage?: MemoryCandidateLineage;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const normalizeList = (values: readonly string[] | undefined): string[] =>
  Array.from(new Set((values || []).filter(isNonEmptyString).map((value) => value.trim()))).sort();

const encodeSegment = (value: string): string => encodeURIComponent(value.trim());

function sourceReferences(candidate: MemoryCandidate): string[] {
  const provenance = candidate.provenance;
  const evidence = candidate.evidence;
  return [
    ...normalizeList(provenance.sourceMessageIds).map((id) => `message:${id}`),
    ...normalizeList(evidence.sourceMessageIds).map((id) => `message:${id}`),
    ...normalizeList(provenance.sourceEventIds).map((id) => `event:${id}`),
    ...normalizeList(evidence.sourceEventIds).map((id) => `event:${id}`),
    ...normalizeList(provenance.sourceRecordIds).map((id) => `record:${id}`),
    ...normalizeList(evidence.sourceRecordIds).map((id) => `record:${id}`),
  ].sort();
}

/**
 * Build a deterministic source-based key.  It deliberately excludes the
 * candidate statement and candidateId: semantic deduplication is a later
 * concern, while the same source can produce different candidate kinds.
 */
export function buildMemoryCandidateIdempotencyKey(candidate: MemoryCandidate): string {
  const scope = candidate.scope;
  const provenance = candidate.provenance;
  const parts = [
    "memory-candidate",
    String(MEMORY_CANDIDATE_SCHEMA_VERSION),
    scope.characterId,
    scope.relationId,
    scope.userIdentityId,
    scope.conversationId || "",
    candidate.candidateKind,
    provenance.producer,
    provenance.sourceType,
    provenance.authorship,
    provenance.conversationId || "",
    provenance.app || "",
    sourceReferences(candidate).join(","),
    candidate.evidence.evidenceKey || "",
  ];
  return parts.map(encodeSegment).join("~");
}

export function hasTraceableMemoryCandidateProvenance(candidate: MemoryCandidate): boolean {
  const hasReference = sourceReferences(candidate).length > 0;
  const explicitManualSource = candidate.provenance.sourceType === "manual"
    && isNonEmptyString(candidate.evidence.evidenceKey);
  return hasReference || explicitManualSource;
}

export function isValidMemoryCandidateConfidence(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0 && value <= 1);
}

export function isValidMemoryCandidateImportance(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 1 && value <= 10);
}
