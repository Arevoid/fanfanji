import type { MemoryItem } from "../../types";
import { DEFAULT_IDENTITY_ID, type CharacterRelationship } from "../relationship/characterRelationship";
import { KNOWLEDGE_CLAIM_SCHEMA_VERSION, type KnowledgeClaim } from "./characterKnowledgeTypes";

export type LegacyKnowledgeDiagnostic = "missing_relation" | "ambiguous_default_relation" | "scope_mismatch";

export type LegacyKnowledgeProjection =
  | { migrated: true; claim: KnowledgeClaim }
  | { migrated: false; diagnostic: LegacyKnowledgeDiagnostic };

/**
 * Read-only bridge for old MemoryItem data. It never mutates Memory and never
 * treats a missing relation as a wildcard across identities.
 */
export function projectLegacyMemoryToKnowledgeClaim(
  memory: MemoryItem,
  relationships: readonly CharacterRelationship[],
): LegacyKnowledgeProjection {
  const relation = memory.relationId
    ? relationships.find((item) => item.id === memory.relationId)
    : (() => {
      const candidates = relationships.filter((item) =>
        item.userIdentityId === DEFAULT_IDENTITY_ID && item.characterId === memory.characterId,
      );
      return candidates.length === 1 ? candidates[0] : undefined;
    })();

  if (!relation) {
    const defaultCandidates = relationships.filter((item) =>
      item.userIdentityId === DEFAULT_IDENTITY_ID && item.characterId === memory.characterId,
    );
    return {
      migrated: false,
      diagnostic: !memory.relationId && defaultCandidates.length > 1
        ? "ambiguous_default_relation"
        : "missing_relation",
    };
  }
  if (relation.characterId !== memory.characterId) return { migrated: false, diagnostic: "scope_mismatch" };

  return {
    migrated: true,
    claim: {
      id: `legacy-memory:${memory.id}`,
      relationId: relation.id,
      characterId: relation.characterId,
      userIdentityId: relation.userIdentityId,
      conversationId: relation.conversationId,
      kind: "fact",
      subject: "other",
      statement: memory.content.trim(),
      truthStatus: "legacy_unverified",
      temporalStatus: "unknown",
      source: {
        kind: "legacy_memory",
        authorship: "unknown",
        sourceRecordId: memory.id,
        producer: "legacy-memory-compat.v1",
        evidenceKey: `legacy-memory:${memory.id}`,
      },
      confidence: 0.25,
      userConfirmed: false,
      recordedAt: memory.timestamp,
      status: "active",
      visibility: "relation_private",
      schemaVersion: KNOWLEDGE_CLAIM_SCHEMA_VERSION,
    },
  };
}
