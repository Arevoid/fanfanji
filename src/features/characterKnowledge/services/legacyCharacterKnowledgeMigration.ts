import type { Character, MemoryItem, OfflineStory } from "../../../types";
import { DEFAULT_IDENTITY_ID, type CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import {
  BEHAVIOR_CORRECTION_SCHEMA_VERSION,
  CONVERSATION_SUMMARY_SCHEMA_VERSION,
  type BehaviorCorrectionRecord,
  type ConversationSummaryRecord,
  type KnowledgeClaim,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { projectLegacyMemoryToKnowledgeClaim } from "../../../domain/characterKnowledge/legacyKnowledgeCompatibility";

export type LegacyTruthMigrationDiagnostic =
  | "missing_relation"
  | "ambiguous_default_relation"
  | "scope_mismatch"
  | "missing_default_relation_for_character_summary";

export interface LegacyTruthMigrationDiagnosticRecord {
  recordId: string;
  kind: "memory" | "character_summary";
  diagnostic: LegacyTruthMigrationDiagnostic;
}

export interface LegacyTruthMigrationInput {
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  memories: readonly MemoryItem[];
  offlineStories?: readonly OfflineStory[];
  existingClaims?: readonly KnowledgeClaim[];
  existingSummaries?: readonly ConversationSummaryRecord[];
  existingCorrections?: readonly BehaviorCorrectionRecord[];
  now: number;
}

export interface LegacyTruthMigrationResult {
  claims: KnowledgeClaim[];
  summaries: ConversationSummaryRecord[];
  corrections: BehaviorCorrectionRecord[];
  diagnostics: LegacyTruthMigrationDiagnosticRecord[];
  migratedMemoryIds: string[];
  migratedSummaryIds: string[];
  migratedCorrectionIds: string[];
  orphanRecordIds: string[];
}

const nonEmpty = (value: string | undefined): value is string => Boolean(value?.trim());

const directRelationForMemory = (memory: MemoryItem, relationships: readonly CharacterRelationship[]): CharacterRelationship | undefined => {
  if (memory.relationId) return relationships.find((relation) => relation.id === memory.relationId);
  const candidates = relationships.filter((relation) =>
    relation.userIdentityId === DEFAULT_IDENTITY_ID && relation.characterId === memory.characterId,
  );
  return candidates.length === 1 ? candidates[0] : undefined;
};

const parseOocCorrection = (content: string): { originalResponse?: string; instruction: string } | undefined => {
  const trimmed = content.trim();
  if (!/^\[OOC\b/i.test(trimmed)) return undefined;
  const structured = trimmed.match(/^\[OOC[^\]]*\]\s*原回答[：:]([\s\S]*?)被指出不符合人设。用户修正意见[：:]([\s\S]*)$/u);
  if (structured) {
    return {
      originalResponse: structured[1].trim().replace(/^“|”$/gu, ""),
      instruction: structured[2].trim(),
    };
  }
  const fallback = trimmed.replace(/^\[OOC[^\]]*\]\s*/iu, "").trim();
  return fallback ? { instruction: fallback } : undefined;
};

const storyIdForMemory = (memory: MemoryItem, stories: readonly OfflineStory[]): string | undefined => {
  const matched = stories.find((story) => memory.content.includes(`offline-story:${story.id}:`));
  if (matched) return matched.id;
  const marker = memory.content.match(/\[offline-story:([^\]]+)\]/u)?.[1];
  if (!marker) return undefined;
  const separator = marker.lastIndexOf(":");
  return separator > 0 ? marker.slice(0, separator) : marker;
};

const hasSourceId = <T extends { id: string; sourceRecordId?: string; relationId?: string }>(
  records: readonly T[],
  sourceRecordId: string,
  relationId: string,
): boolean => records.some((record) =>
  (record.sourceRecordId === sourceRecordId && record.relationId === relationId)
  || record.id === `legacy-${sourceRecordId}`,
);

const relationScope = (relation: CharacterRelationship) => ({
  relationId: relation.id,
  characterId: relation.characterId,
  userIdentityId: relation.userIdentityId,
  conversationId: relation.conversationId,
});

const summaryForRelation = (
  relation: CharacterRelationship,
  sourceRecordId: string,
  summary: string,
  generatedAt: number,
  generator: string,
): ConversationSummaryRecord => ({
  id: `legacy-${generator}:${sourceRecordId}:${relation.id}`,
  relationId: relation.id,
  characterId: relation.characterId,
  userIdentityId: relation.userIdentityId,
  conversationId: relation.conversationId,
  sourceRecordId,
  summary: summary.trim(),
  sourceMessageIds: [],
  sourceClaimIds: [],
  generatedAt,
  generator: `legacy-${generator}.v1`,
  projectionVersion: 1,
  status: "active",
  schemaVersion: CONVERSATION_SUMMARY_SCHEMA_VERSION,
});

/**
 * Converts old, mixed-scope records into relation-scoped Truth Layer data.
 * This function is pure: callers can persist the returned records only after
 * every conversion has succeeded, leaving the legacy Memory store untouched.
 */
export function migrateLegacyCharacterKnowledge(input: LegacyTruthMigrationInput): LegacyTruthMigrationResult {
  const stories = input.offlineStories || [];
  const existingClaims = input.existingClaims || [];
  const existingSummaries = input.existingSummaries || [];
  const existingCorrections = input.existingCorrections || [];
  const claims: KnowledgeClaim[] = [];
  const summaries: ConversationSummaryRecord[] = [];
  const corrections: BehaviorCorrectionRecord[] = [];
  const diagnostics: LegacyTruthMigrationDiagnosticRecord[] = [];
  const migratedMemoryIds: string[] = [];
  const migratedSummaryIds: string[] = [];
  const migratedCorrectionIds: string[] = [];
  const orphanRecordIds: string[] = [];

  const addDiagnostic = (recordId: string, kind: LegacyTruthMigrationDiagnosticRecord["kind"], diagnostic: LegacyTruthMigrationDiagnostic) => {
    diagnostics.push({ recordId, kind, diagnostic });
    orphanRecordIds.push(recordId);
  };

  for (const memory of input.memories) {
    const ooc = parseOocCorrection(memory.content);
    if (ooc) {
      const relation = directRelationForMemory(memory, input.relationships);
      if (!relation || relation.characterId !== memory.characterId) {
        const candidates = input.relationships.filter((item) => item.userIdentityId === DEFAULT_IDENTITY_ID && item.characterId === memory.characterId);
        addDiagnostic(`memory:${memory.id}`, "memory", memory.relationId ? "scope_mismatch" : (candidates.length > 1 ? "ambiguous_default_relation" : "missing_relation"));
        continue;
      }
      const correction: BehaviorCorrectionRecord = {
        id: `legacy-ooc:${memory.id}`,
        relationId: relation.id,
        characterId: relation.characterId,
        userIdentityId: relation.userIdentityId,
        conversationId: relation.conversationId,
        sourceRecordId: memory.id,
        instruction: ooc.instruction,
        ...(nonEmpty(ooc.originalResponse) ? { originalResponse: ooc.originalResponse } : {}),
        sourceMessageIds: [],
        createdAt: memory.timestamp,
        updatedAt: memory.timestamp,
        status: "active",
        schemaVersion: BEHAVIOR_CORRECTION_SCHEMA_VERSION,
      };
      migratedMemoryIds.push(memory.id);
      migratedCorrectionIds.push(correction.id);
      if (!hasSourceId(existingCorrections, memory.id, relation.id)) corrections.push(correction);
      continue;
    }

    if (memory.sourceKnowledgeClaimIds?.length) {
      migratedMemoryIds.push(memory.id);
      continue;
    }
    const projection = projectLegacyMemoryToKnowledgeClaim(memory, input.relationships);
    if (projection.migrated === false) {
      addDiagnostic(`memory:${memory.id}`, "memory", projection.diagnostic);
      continue;
    }
    const storyId = storyIdForMemory(memory, stories);
    const claim = storyId
      ? {
        ...projection.claim,
        source: {
          ...projection.claim.source,
          kind: "offline_story" as const,
          storyId,
          producer: "legacy-offline-story-memory.v1",
          evidenceKey: `legacy-offline-story:${memory.id}`,
        },
      }
      : projection.claim;
    migratedMemoryIds.push(memory.id);
      if (!existingClaims.some((item) =>
        item.id === claim.id
        || (item.source.sourceRecordId === memory.id && isExactTruthScope(item, claim)))) claims.push(claim);
  }

  for (const relation of input.relationships) {
    if (!relation.compressedMemory?.trim()) continue;
    const summary = summaryForRelation(relation, relation.id, relation.compressedMemory, relation.updatedAt, "relationship-compressed-memory");
    migratedSummaryIds.push(summary.id);
    if (!existingSummaries.some((item) => item.id === summary.id || (item.sourceRecordId === relation.id && isExactTruthScope(item, relationScope(relation))))) summaries.push(summary);
  }

  for (const character of input.characters) {
    if (!character.compressedMemory?.trim()) continue;
    const candidates = input.relationships.filter((relation) =>
      relation.userIdentityId === DEFAULT_IDENTITY_ID && relation.characterId === character.id,
    );
    if (candidates.length !== 1) {
      addDiagnostic(`character-summary:${character.id}`, "character_summary", candidates.length > 1 ? "ambiguous_default_relation" : "missing_default_relation_for_character_summary");
      continue;
    }
    const summary = summaryForRelation(candidates[0], character.id, character.compressedMemory, character.lastActiveTime || input.now, "character-compressed-memory");
    migratedSummaryIds.push(summary.id);
    if (!existingSummaries.some((item) => item.id === summary.id || (item.sourceRecordId === character.id && isExactTruthScope(item, relationScope(candidates[0]))))) summaries.push(summary);
  }

  return {
    claims,
    summaries,
    corrections,
    diagnostics,
    migratedMemoryIds: Array.from(new Set(migratedMemoryIds)),
    migratedSummaryIds: Array.from(new Set(migratedSummaryIds)),
    migratedCorrectionIds: Array.from(new Set(migratedCorrectionIds)),
    orphanRecordIds: Array.from(new Set(orphanRecordIds)),
  };
}
