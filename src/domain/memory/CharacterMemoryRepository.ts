import type { CharacterEvent } from "../characterLife/characterEventTypes";
import type { CharacterTruthScope, ConversationSummaryRecord, KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
import { loadKnowledgeClaims } from "../../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../../core/storage/repositories/conversationSummaryRepository";
import { loadMemories } from "../../core/storage/repositories/memoryRepository";
import { loadCharacterEvents } from "../../core/storage/repositories/characterEventRepository";

type MemoryItem = ReturnType<typeof loadMemories>["value"][number];

export type CharacterMemoryReadKind = "truth" | "summary" | "legacy-memory" | "event";
export type CharacterMemoryAuthority = "authoritative" | "derived" | "legacy" | "event";
export type CharacterMemoryScopeStatus = "exact" | "partial" | "unscoped" | "mismatch";
export type CharacterMemoryStatus = "active" | "inactive" | "superseded" | "stale" | "retracted";

export interface CharacterMemoryReadScope extends CharacterTruthScope {}

export interface CharacterMemoryReadRecord {
  id: string;
  kind: CharacterMemoryReadKind;
  scope: Partial<CharacterMemoryReadScope>;
  scopeStatus: CharacterMemoryScopeStatus;
  content: string;
  temporalStatus?: string;
  occurredAt?: number;
  recordedAt?: number;
  validFrom?: number;
  validTo?: number;
  sourceIds: string[];
  sourceClaimIds?: string[];
  canonical: boolean;
  authority: CharacterMemoryAuthority;
  status: CharacterMemoryStatus;
  canonicalMirrorOf?: string[];
}

export type CharacterMemoryDropReason =
  | "scope_mismatch"
  | "missing_scope"
  | "superseded"
  | "inactive"
  | "temporal_ineligible"
  | "missing_provenance";

export interface CharacterMemoryReadDrop {
  id: string;
  kind: CharacterMemoryReadKind;
  reason: CharacterMemoryDropReason;
  sourceIds: string[];
}

export interface CharacterMemoryReadResult {
  records: CharacterMemoryReadRecord[];
  dropped: CharacterMemoryReadDrop[];
}

export interface CharacterMemoryRepository {
  readAll(): CharacterMemoryReadRecord[];
  readForScope(scope: CharacterMemoryReadScope, now?: number): CharacterMemoryReadResult;
}

export interface CharacterMemoryRepositorySources {
  claims: readonly KnowledgeClaim[];
  summaries: readonly ConversationSummaryRecord[];
  memories: readonly MemoryItem[];
  events?: readonly CharacterEvent[];
}

const scopeStatus = (
  value: Partial<CharacterMemoryReadScope>,
  expected: CharacterMemoryReadScope,
  conversationApplicable: boolean,
): CharacterMemoryScopeStatus => {
  if (["characterId", "relationId", "userIdentityId"].some((key) => {
    const actual = value[key as keyof CharacterMemoryReadScope];
    const target = expected[key as keyof CharacterMemoryReadScope];
    return actual !== undefined && actual !== target;
  }) || (value.conversationId !== undefined && value.conversationId !== expected.conversationId)) return "mismatch";
  if (!value.characterId || !value.relationId || !value.userIdentityId) return "unscoped";
  if (conversationApplicable && expected.conversationId && !value.conversationId) return "partial";
  return "exact";
};

const claimRecord = (claim: KnowledgeClaim): CharacterMemoryReadRecord => ({
  id: claim.id,
  kind: "truth",
  scope: { characterId: claim.characterId, relationId: claim.relationId, userIdentityId: claim.userIdentityId, conversationId: claim.conversationId },
  scopeStatus: "exact",
  content: claim.statement,
  temporalStatus: claim.temporalStatus,
  occurredAt: claim.occurredAt,
  recordedAt: claim.recordedAt,
  validFrom: claim.validFrom,
  validTo: claim.validTo,
  sourceIds: Array.from(new Set([...(claim.source.messageIds || []), claim.source.sourceRecordId, claim.source.eventId, claim.source.storyId].filter((item): item is string => Boolean(item)))),
  canonical: true,
  authority: "authoritative",
  status: claim.supersededById ? "superseded" : claim.status === "retracted" ? "retracted" : "active",
});

const summaryRecord = (summary: ConversationSummaryRecord): CharacterMemoryReadRecord => ({
  id: summary.id,
  kind: "summary",
  scope: { characterId: summary.characterId, relationId: summary.relationId, userIdentityId: summary.userIdentityId, conversationId: summary.conversationId },
  scopeStatus: "exact",
  content: summary.summary,
  occurredAt: summary.rangeStartAt,
  recordedAt: summary.generatedAt,
  validFrom: summary.rangeStartAt,
  validTo: summary.rangeEndAt,
  sourceIds: Array.from(new Set([...summary.sourceMessageIds, ...summary.sourceClaimIds, summary.sourceRecordId].filter(Boolean))),
  sourceClaimIds: [...summary.sourceClaimIds],
  canonical: false,
  authority: "derived",
  status: summary.status,
});

const legacyRecord = (memory: MemoryItem): CharacterMemoryReadRecord => ({
  id: memory.id,
  kind: "legacy-memory",
  scope: { characterId: memory.characterId, relationId: memory.relationId, userIdentityId: memory.userIdentityId, conversationId: memory.conversationId },
  scopeStatus: "unscoped",
  content: memory.content,
  occurredAt: memory.timestamp,
  recordedAt: memory.timestamp,
  sourceIds: Array.from(new Set([memory.sourceMomentId, memory.sourceCinemaId, memory.sourceReadingRoomId, ...(memory.sourceKnowledgeClaimIds || [])].filter(Boolean))),
  canonical: false,
  authority: "legacy",
  status: memory.recallDisabled ? "inactive" : "active",
  ...(memory.sourceKnowledgeClaimIds?.length ? { canonicalMirrorOf: [...memory.sourceKnowledgeClaimIds] } : {}),
});

const eventRecord = (event: CharacterEvent): CharacterMemoryReadRecord => ({
  id: event.id,
  kind: "event",
  scope: { characterId: event.characterId, relationId: event.relationId, userIdentityId: event.userIdentityId },
  scopeStatus: "exact",
  content: event.summary,
  occurredAt: event.occurredAt,
  recordedAt: event.recordedAt,
  sourceIds: [event.source].filter(Boolean),
  canonical: false,
  authority: "event",
  status: event.status === "active" ? "active" : "inactive",
});

const isTemporallyEligible = (record: CharacterMemoryReadRecord, now: number): boolean =>
  (record.validFrom === undefined || record.validFrom <= now)
  && (record.validTo === undefined || record.validTo > now);

const summarySourcesValid = (summary: CharacterMemoryReadRecord, claims: readonly CharacterMemoryReadRecord[]): boolean => {
  if (summary.kind !== "summary" || !summary.sourceClaimIds?.length) return true;
  const sourceClaims = claims.filter((claim) => summary.sourceClaimIds?.includes(claim.id)
    && claim.scope.characterId === summary.scope.characterId
    && claim.scope.relationId === summary.scope.relationId
    && claim.scope.userIdentityId === summary.scope.userIdentityId
    && claim.scope.conversationId === summary.scope.conversationId);
  return sourceClaims.length === summary.sourceClaimIds.length
    && sourceClaims.every((claim) => claim.status === "active" && claim.scopeStatus === "exact");
};

export function createCharacterMemoryRepository(
  sourceOverrides: Partial<CharacterMemoryRepositorySources> = {},
): CharacterMemoryRepository {
  const readSources = (): CharacterMemoryRepositorySources => ({
    claims: sourceOverrides.claims || loadKnowledgeClaims().value,
    summaries: sourceOverrides.summaries || loadConversationSummaries().value,
    memories: sourceOverrides.memories || loadMemories([]).value,
    events: sourceOverrides.events || loadCharacterEvents().value,
  });

  return {
    readAll(): CharacterMemoryReadRecord[] {
      const sources = readSources();
      return [
        ...sources.claims.map(claimRecord),
        ...sources.summaries.map(summaryRecord),
        ...sources.memories.map(legacyRecord),
        ...(sources.events || []).map(eventRecord),
      ];
    },
    readForScope(scope, now = Date.now()): CharacterMemoryReadResult {
      const all = this.readAll();
      const claims = all.filter((record) => record.kind === "truth");
      const records: CharacterMemoryReadRecord[] = [];
      const dropped: CharacterMemoryReadDrop[] = [];
      for (const record of all) {
        const status = record.kind === "legacy-memory"
          ? scopeStatus(record.scope, scope, true)
          : scopeStatus(record.scope, scope, record.kind !== "event");
        if (status !== "exact") {
          dropped.push({ id: record.id, kind: record.kind, reason: status === "partial" || status === "unscoped" ? "missing_scope" : "scope_mismatch", sourceIds: record.sourceIds });
          continue;
        }
        if (record.status === "superseded") {
          dropped.push({ id: record.id, kind: record.kind, reason: "superseded", sourceIds: record.sourceIds });
          continue;
        }
        if (record.status !== "active") {
          dropped.push({ id: record.id, kind: record.kind, reason: "inactive", sourceIds: record.sourceIds });
          continue;
        }
        if (!isTemporallyEligible(record, now)) {
          dropped.push({ id: record.id, kind: record.kind, reason: "temporal_ineligible", sourceIds: record.sourceIds });
          continue;
        }
        if (!summarySourcesValid(record, claims)) {
          dropped.push({ id: record.id, kind: record.kind, reason: "inactive", sourceIds: record.sourceIds });
          continue;
        }
        records.push({ ...record, scopeStatus: status });
      }
      return { records, dropped };
    },
  };
}

export type { CharacterTruthScope };
