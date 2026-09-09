import type { TemporalStatus } from "../characterKnowledge/characterKnowledgeTypes";
import type {
  MemoryCandidateDurability,
  MemoryCandidateKind,
  MemoryCandidateRelationshipSignalKind,
  MemoryCandidateSemanticFacet,
} from "./memoryCandidate";

export const MEMORY_EXTRACTION_SCHEMA_V2 = 2 as const;

export type MemoryExtractionSemanticFacet = MemoryCandidateSemanticFacet;
export type MemoryExtractionDurability = MemoryCandidateDurability;
export type MemoryExtractionRole = "user" | "character" | "relationship" | "other";
export type MemoryRelationshipSignalKind = MemoryCandidateRelationshipSignalKind;
export type MemoryExtractionRejectionStage = "parser" | "knowledge_gate" | "admission";

/** Diagnostics carry classification only; candidate bodies and quotes stay out. */
export interface MemoryExtractionRejectionDiagnostic {
  stage: MemoryExtractionRejectionStage;
  reason: string;
  candidateKind?: MemoryCandidateKind;
  sourceMessageCount?: number;
}

/** AI-facing roles are descriptive only; the adapter resolves canonical IDs. */
export interface MemoryExtractionCandidateV2 {
  schemaVersion: typeof MEMORY_EXTRACTION_SCHEMA_V2;
  kind: MemoryCandidateKind;
  semanticFacet?: MemoryExtractionSemanticFacet;
  durability?: MemoryExtractionDurability;
  relationshipSignalKind?: MemoryRelationshipSignalKind;
  statement: string;
  temporalStatus: TemporalStatus;
  sourceMessageIds: readonly string[];
  evidenceQuote: string;
  occurredAt?: number;
  validFrom?: number;
  validTo?: number;
  confidence?: number;
  importance?: number;
  actorRole?: MemoryExtractionRole;
  targetRole?: MemoryExtractionRole;
}

const KINDS = new Set<MemoryCandidateKind>([
  "fact", "event", "plan", "belief", "episodic", "relationship_signal", "scene_only", "subjective_reflection", "unknown",
]);
const FACETS = new Set<MemoryExtractionSemanticFacet>(["preference", "hypothesis", "relationship_signal", "scene_only", "subjective_reflection"]);
const DURABILITIES = new Set<MemoryExtractionDurability>(["stable", "temporary", "unknown"]);
const ROLES = new Set<MemoryExtractionRole>(["user", "character", "relationship", "other"]);
const SIGNALS = new Set<MemoryRelationshipSignalKind>(["promise", "trust", "conflict", "affection", "boundary", "commitment"]);
const TEMPORAL = new Set<TemporalStatus>(["past", "present", "future", "timeless", "unknown"]);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function optionalRole(value: unknown): MemoryExtractionRole | undefined {
  return ROLES.has(value as MemoryExtractionRole) ? value as MemoryExtractionRole : undefined;
}

/**
 * Normalize additive V2 metadata. Unknown optional fields are ignored; an
 * unknown semantic facet makes the candidate unknown instead of authoritative.
 */
export function normalizeMemoryExtractionCandidateV2(
  value: unknown,
  allowedMessageIds: ReadonlySet<string>,
): MemoryExtractionCandidateV2 | undefined {
  if (!isRecord(value)
    || value.schemaVersion !== MEMORY_EXTRACTION_SCHEMA_V2
    || !nonEmpty(value.statement)
    || !KINDS.has(value.kind as MemoryCandidateKind)
    || !TEMPORAL.has(value.temporalStatus as TemporalStatus)
    || !Array.isArray(value.sourceMessageIds)
    || value.sourceMessageIds.length === 0
    || value.sourceMessageIds.some((id) => !nonEmpty(id) || !allowedMessageIds.has(id.trim()))
    || !nonEmpty(value.evidenceQuote)) return undefined;

  const rawFacet = value.semanticFacet;
  const semanticFacet = FACETS.has(rawFacet as MemoryExtractionSemanticFacet)
    ? rawFacet as MemoryExtractionSemanticFacet
    : undefined;
  const hasUnknownFacet = rawFacet !== undefined && semanticFacet === undefined;
  const rawDurability = value.durability;
  const durability = DURABILITIES.has(rawDurability as MemoryExtractionDurability)
    ? rawDurability as MemoryExtractionDurability
    : rawDurability === undefined ? undefined : "unknown";
  const relationshipSignalKind = SIGNALS.has(value.relationshipSignalKind as MemoryRelationshipSignalKind)
    ? value.relationshipSignalKind as MemoryRelationshipSignalKind
    : undefined;

  const kind = hasUnknownFacet ? "unknown" : value.kind as MemoryCandidateKind;
  const kindFacetConflict = (semanticFacet === "preference" && kind !== "fact")
    || (semanticFacet === "hypothesis" && kind !== "belief")
    || (semanticFacet === "relationship_signal" && kind !== "relationship_signal")
    || (semanticFacet === "scene_only" && kind !== "scene_only")
    || (semanticFacet === "subjective_reflection" && kind !== "subjective_reflection");
  return {
    schemaVersion: MEMORY_EXTRACTION_SCHEMA_V2,
    kind: kindFacetConflict ? "unknown" : kind,
    ...(semanticFacet && !kindFacetConflict ? { semanticFacet } : {}),
    ...(durability ? { durability } : {}),
    ...(relationshipSignalKind && semanticFacet === "relationship_signal" ? { relationshipSignalKind } : {}),
    statement: value.statement.trim(),
    temporalStatus: value.temporalStatus as TemporalStatus,
    sourceMessageIds: Array.from(new Set((value.sourceMessageIds as string[]).map((id) => id.trim()))),
    evidenceQuote: value.evidenceQuote.trim(),
    ...(finite(value.occurredAt) && value.occurredAt >= 0 ? { occurredAt: value.occurredAt } : {}),
    ...(finite(value.validFrom) && value.validFrom >= 0 ? { validFrom: value.validFrom } : {}),
    ...(finite(value.validTo) && value.validTo >= 0 ? { validTo: value.validTo } : {}),
    ...(finite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 ? { confidence: value.confidence } : {}),
    ...(finite(value.importance) && value.importance >= 1 && value.importance <= 10 ? { importance: value.importance } : {}),
    ...(optionalRole(value.actorRole) ? { actorRole: optionalRole(value.actorRole) } : {}),
    ...(optionalRole(value.targetRole) ? { targetRole: optionalRole(value.targetRole) } : {}),
  };
}
