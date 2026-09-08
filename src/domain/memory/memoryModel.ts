import type { MemoryItem } from "../../types";
import type {
  BehaviorCorrectionRecord,
  ConversationSummaryRecord,
  KnowledgeClaim,
} from "../characterKnowledge/characterKnowledgeTypes";

/**
 * The canonical vocabulary for durable memory.  This model is intentionally
 * separate from the legacy MemoryItem shape: phase 1 can project old data
 * into it without rewriting or deleting the user's stored records.
 */
export const MEMORY_MODEL_SCHEMA_VERSION = 1 as const;

export type MemoryLayer = "temporary" | "episodic" | "core" | "rule";
export type MemoryRecordKind =
  | "fact"
  | "preference"
  | "plan"
  | "belief"
  | "hypothesis"
  | "event"
  | "relationship"
  | "reflection"
  | "rule"
  | "unknown";
export type MemoryRecordVisibility =
  | "relation-private"
  | "user-private"
  | "public"
  | "story-only"
  | "unclassified";
export type MemoryRecordStatus = "candidate" | "active" | "stale" | "superseded" | "retracted";
export type MemorySourceApp =
  | "chat"
  | "offline"
  | "memory"
  | "moments"
  | "notes"
  | "diary"
  | "cinema"
  | "schedule"
  | "forum"
  | "relationship-network"
  | "music"
  | "reading"
  | "worldbook"
  | "archives"
  | "system"
  | "legacy";
export type MemorySourceKind =
  | "user-message"
  | "character-message"
  | "manual"
  | "automatic-extraction"
  | "summary"
  | "deterministic-event"
  | "legacy-memory"
  | "import";

export interface MemoryRecordScope {
  characterId?: string;
  relationId?: string;
  userIdentityId?: string;
  conversationId?: string;
  storyId?: string;
}

export interface MemoryRecordProvenance {
  app: MemorySourceApp;
  kind: MemorySourceKind;
  sourceRecordId?: string;
  sourceMessageIds?: string[];
  sourceClaimIds?: string[];
  sourceEventId?: string;
}

export interface MemoryRecord {
  id: string;
  schemaVersion: typeof MEMORY_MODEL_SCHEMA_VERSION;
  layer: MemoryLayer;
  kind: MemoryRecordKind;
  content: string;
  scope: MemoryRecordScope;
  visibility: MemoryRecordVisibility;
  status: MemoryRecordStatus;
  importance: number;
  confidence: number;
  userConfirmed: boolean;
  occurredAt?: number;
  recordedAt: number;
  validFrom?: number;
  validTo?: number;
  provenance: MemoryRecordProvenance;
  supersedesId?: string;
  supersededById?: string;
}

const MEMORY_LAYERS = new Set<MemoryLayer>(["temporary", "episodic", "core", "rule"]);
const MEMORY_KINDS = new Set<MemoryRecordKind>([
  "fact",
  "preference",
  "plan",
  "belief",
  "hypothesis",
  "event",
  "relationship",
  "reflection",
  "rule",
  "unknown",
]);
const MEMORY_VISIBILITIES = new Set<MemoryRecordVisibility>(["relation-private", "user-private", "public", "story-only", "unclassified"]);
const MEMORY_STATUSES = new Set<MemoryRecordStatus>(["candidate", "active", "stale", "superseded", "retracted"]);
const MEMORY_SOURCE_KINDS = new Set<MemorySourceKind>([
  "user-message",
  "character-message",
  "manual",
  "automatic-extraction",
  "summary",
  "deterministic-event",
  "legacy-memory",
  "import",
]);

export interface MemoryRelationReadScope {
  characterId: string;
  relationId: string;
  userIdentityId?: string;
  conversationId?: string;
}

export function memoryRecordScopeKey(scope: MemoryRecordScope): string {
  return [scope.characterId, scope.relationId, scope.userIdentityId, scope.conversationId, scope.storyId]
    .map((value) => value?.trim() || "")
    .join("\u001f");
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const normalizeString = (value: unknown): string | undefined => isNonEmptyString(value) ? value.trim() : undefined;
const normalizeStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const values = value.map(normalizeString);
  if (values.some((item) => item === undefined)) return undefined;
  const unique = Array.from(new Set(values as string[]));
  return unique.length > 0 ? unique : undefined;
};

/**
 * Validate and normalize persisted canonical records at the domain boundary.
 * Unknown or malformed records are ignored by callers instead of entering a
 * prompt, so a damaged local-storage entry cannot widen a relation scope.
 */
export function normalizeMemoryRecord(value: unknown): MemoryRecord | undefined {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || value.schemaVersion !== MEMORY_MODEL_SCHEMA_VERSION
    || !MEMORY_LAYERS.has(value.layer as MemoryLayer)
    || !MEMORY_KINDS.has(value.kind as MemoryRecordKind)
    || !isNonEmptyString(value.content)
    || !isRecord(value.scope)
    || !MEMORY_VISIBILITIES.has(value.visibility as MemoryRecordVisibility)
    || !MEMORY_STATUSES.has(value.status as MemoryRecordStatus)
    || !isFiniteNumber(value.importance)
    || value.importance < 1
    || value.importance > 10
    || !isFiniteNumber(value.confidence)
    || value.confidence < 0
    || value.confidence > 1
    || typeof value.userConfirmed !== "boolean"
    || !isFiniteNumber(value.recordedAt)
    || !isRecord(value.provenance)
    || !isNonEmptyString(value.provenance.app)
    || !MEMORY_SOURCE_POLICIES[value.provenance.app as MemorySourceApp]
    || !MEMORY_SOURCE_KINDS.has(value.provenance.kind as MemorySourceKind)) return undefined;

  const scope: MemoryRecordScope = {};
  for (const key of ["characterId", "relationId", "userIdentityId", "conversationId", "storyId"] as const) {
    if (value.scope[key] !== undefined && !isNonEmptyString(value.scope[key])) return undefined;
    const normalized = normalizeString(value.scope[key]);
    if (normalized) scope[key] = normalized;
  }
  const provenance: MemoryRecordProvenance = {
    app: value.provenance.app as MemorySourceApp,
    kind: value.provenance.kind as MemorySourceKind,
    ...(normalizeString(value.provenance.sourceRecordId) ? { sourceRecordId: normalizeString(value.provenance.sourceRecordId) } : {}),
    ...(normalizeStringArray(value.provenance.sourceMessageIds) ? { sourceMessageIds: normalizeStringArray(value.provenance.sourceMessageIds) } : {}),
    ...(normalizeStringArray(value.provenance.sourceClaimIds) ? { sourceClaimIds: normalizeStringArray(value.provenance.sourceClaimIds) } : {}),
    ...(normalizeString(value.provenance.sourceEventId) ? { sourceEventId: normalizeString(value.provenance.sourceEventId) } : {}),
  };
  const optionalTimes = [value.occurredAt, value.validFrom, value.validTo];
  if (optionalTimes.some((time) => time !== undefined && !isFiniteNumber(time))) return undefined;
  const optionalIds = [value.supersedesId, value.supersededById];
  if (optionalIds.some((id) => id !== undefined && !isNonEmptyString(id))) return undefined;
  return {
    id: value.id.trim(),
    schemaVersion: MEMORY_MODEL_SCHEMA_VERSION,
    layer: value.layer as MemoryLayer,
    kind: value.kind as MemoryRecordKind,
    content: value.content.trim(),
    scope,
    visibility: value.visibility as MemoryRecordVisibility,
    status: value.status as MemoryRecordStatus,
    importance: value.importance,
    confidence: value.confidence,
    userConfirmed: value.userConfirmed,
    ...(isFiniteNumber(value.occurredAt) ? { occurredAt: value.occurredAt } : {}),
    recordedAt: value.recordedAt,
    ...(isFiniteNumber(value.validFrom) ? { validFrom: value.validFrom } : {}),
    ...(isFiniteNumber(value.validTo) ? { validTo: value.validTo } : {}),
    provenance,
    ...(isNonEmptyString(value.supersedesId) ? { supersedesId: value.supersedesId.trim() } : {}),
    ...(isNonEmptyString(value.supersededById) ? { supersededById: value.supersededById.trim() } : {}),
  };
}

export interface MemorySourcePolicy {
  app: MemorySourceApp;
  label: string;
  defaultVisibility: MemoryRecordVisibility;
  writeMode: "none" | "candidate" | "user-confirmed";
  readMode: "none" | "relation" | "user" | "public" | "story";
  confirmationRequired: boolean;
}

/**
 * Every app gets an explicit policy before it is allowed to participate in
 * the memory system.  The policy is metadata in phase 1; later phases will
 * route writes and reads through it.
 */
export const MEMORY_SOURCE_POLICIES: Readonly<Record<MemorySourceApp, MemorySourcePolicy>> = {
  chat: { app: "chat", label: "聊天", defaultVisibility: "relation-private", writeMode: "candidate", readMode: "relation", confirmationRequired: false },
  offline: { app: "offline", label: "线下剧情", defaultVisibility: "relation-private", writeMode: "user-confirmed", readMode: "relation", confirmationRequired: true },
  memory: { app: "memory", label: "记忆库", defaultVisibility: "relation-private", writeMode: "user-confirmed", readMode: "relation", confirmationRequired: true },
  moments: { app: "moments", label: "朋友圈", defaultVisibility: "public", writeMode: "candidate", readMode: "public", confirmationRequired: true },
  notes: { app: "notes", label: "备忘录", defaultVisibility: "user-private", writeMode: "none", readMode: "user", confirmationRequired: true },
  diary: { app: "diary", label: "日记", defaultVisibility: "relation-private", writeMode: "candidate", readMode: "relation", confirmationRequired: true },
  cinema: { app: "cinema", label: "影视", defaultVisibility: "relation-private", writeMode: "user-confirmed", readMode: "relation", confirmationRequired: true },
  schedule: { app: "schedule", label: "日程", defaultVisibility: "relation-private", writeMode: "candidate", readMode: "relation", confirmationRequired: false },
  forum: { app: "forum", label: "论坛/公共互动", defaultVisibility: "public", writeMode: "candidate", readMode: "public", confirmationRequired: true },
  "relationship-network": { app: "relationship-network", label: "关系网/NPC", defaultVisibility: "relation-private", writeMode: "user-confirmed", readMode: "relation", confirmationRequired: true },
  music: { app: "music", label: "音乐", defaultVisibility: "user-private", writeMode: "candidate", readMode: "user", confirmationRequired: true },
  reading: { app: "reading", label: "阅读/共读", defaultVisibility: "relation-private", writeMode: "user-confirmed", readMode: "relation", confirmationRequired: true },
  worldbook: { app: "worldbook", label: "世界书", defaultVisibility: "unclassified", writeMode: "user-confirmed", readMode: "relation", confirmationRequired: true },
  archives: { app: "archives", label: "档案馆", defaultVisibility: "unclassified", writeMode: "none", readMode: "none", confirmationRequired: true },
  system: { app: "system", label: "系统事件", defaultVisibility: "unclassified", writeMode: "none", readMode: "none", confirmationRequired: true },
  legacy: { app: "legacy", label: "旧数据", defaultVisibility: "unclassified", writeMode: "none", readMode: "none", confirmationRequired: true },
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

const uniqueStrings = (values: readonly string[] | undefined): string[] | undefined => {
  if (!values) return undefined;
  const result = Array.from(new Set(values.filter((value) => value.trim()).map((value) => value.trim())));
  return result.length > 0 ? result : undefined;
};

const relationVisibility = (relationId?: string): MemoryRecordVisibility =>
  relationId ? "relation-private" : "unclassified";

export function getMemorySourcePolicy(app: MemorySourceApp): MemorySourcePolicy {
  return MEMORY_SOURCE_POLICIES[app];
}

export function memoryRecordFromLegacyItem(
  item: MemoryItem,
  options: {
    sourceApp?: MemorySourceApp;
    layer?: MemoryLayer;
    kind?: MemoryRecordKind;
    visibility?: MemoryRecordVisibility;
    userIdentityId?: string;
    conversationId?: string;
    confidence?: number;
    userConfirmed?: boolean;
  } = {},
): MemoryRecord {
  const sourceApp = options.sourceApp || (item.sourceMomentId ? "moments" : item.sourceReadingRoomId ? "reading" : item.sourceCinemaId ? "cinema" : "legacy");
  return {
    id: item.id,
    schemaVersion: MEMORY_MODEL_SCHEMA_VERSION,
    layer: options.layer || "episodic",
    kind: options.kind || "event",
    content: item.content,
    scope: {
      ...(item.characterId ? { characterId: item.characterId } : {}),
      ...(item.relationId ? { relationId: item.relationId } : {}),
      ...(options.userIdentityId || item.userIdentityId ? { userIdentityId: options.userIdentityId || item.userIdentityId } : {}),
      ...(options.conversationId || item.conversationId ? { conversationId: options.conversationId || item.conversationId } : {}),
    },
    visibility: options.visibility || relationVisibility(item.relationId),
    status: "active",
    importance: clamp(item.importance ?? 5, 1, 10),
    confidence: clamp(options.confidence ?? (item.isManual ? 0.95 : 0.5), 0, 1),
    userConfirmed: options.userConfirmed ?? Boolean(item.isManual),
    occurredAt: item.timestamp,
    recordedAt: item.timestamp,
    provenance: {
      app: sourceApp,
      kind: item.isManual ? "manual" : "legacy-memory",
      sourceRecordId: item.id,
      sourceClaimIds: uniqueStrings(item.sourceKnowledgeClaimIds),
      ...(item.sourceMomentId ? { sourceRecordId: item.sourceMomentId } : {}),
      ...(item.sourceReadingRoomId ? { sourceRecordId: item.sourceReadingRoomId } : {}),
    },
  };
}

const claimKind = (claim: KnowledgeClaim): MemoryRecordKind => claim.kind;

const claimSourceApp = (claim: KnowledgeClaim): MemorySourceApp => {
  if (claim.source.app) return claim.source.app;
  switch (claim.source.kind) {
    case "offline_story": return "offline";
    case "manual": return "memory";
    case "legacy_memory": return "legacy";
    case "deterministic_action": return "system";
    default: return "chat";
  }
};

export function memoryRecordFromKnowledgeClaim(claim: KnowledgeClaim): MemoryRecord {
  const isCore = claim.truthStatus === "confirmed" || claim.userConfirmed;
  return {
    id: claim.id,
    schemaVersion: MEMORY_MODEL_SCHEMA_VERSION,
    layer: isCore ? "core" : "episodic",
    kind: claimKind(claim),
    content: claim.statement,
    scope: {
      characterId: claim.characterId,
      relationId: claim.relationId,
      userIdentityId: claim.userIdentityId,
      ...(claim.conversationId ? { conversationId: claim.conversationId } : {}),
      ...(claim.source.storyId ? { storyId: claim.source.storyId } : {}),
    },
    visibility: claim.visibility === "relation_private" ? "relation-private" : "unclassified",
    status: claim.status === "retracted"
      ? "retracted"
      : claim.supersededById
        ? "superseded"
        : "active",
    importance: isCore ? 8 : 5,
    confidence: clamp(claim.confidence, 0, 1),
    userConfirmed: claim.userConfirmed,
    ...(claim.occurredAt !== undefined ? { occurredAt: claim.occurredAt } : {}),
    recordedAt: claim.recordedAt,
    ...(claim.validFrom !== undefined ? { validFrom: claim.validFrom } : {}),
    ...(claim.validTo !== undefined ? { validTo: claim.validTo } : {}),
    provenance: {
      app: claimSourceApp(claim),
      kind: claim.source.kind === "manual"
        ? "manual"
        : claim.source.kind === "automatic_summary" ? "summary" : "automatic-extraction",
      sourceRecordId: claim.source.sourceRecordId,
      sourceMessageIds: uniqueStrings(claim.source.messageIds),
      sourceClaimIds: [claim.id],
      sourceEventId: claim.source.eventId,
    },
    ...(claim.supersedesId ? { supersedesId: claim.supersedesId } : {}),
    ...(claim.supersededById ? { supersededById: claim.supersededById } : {}),
  };
}

export function memoryRecordFromConversationSummary(summary: ConversationSummaryRecord): MemoryRecord {
  return {
    id: summary.id,
    schemaVersion: MEMORY_MODEL_SCHEMA_VERSION,
    layer: "episodic",
    kind: "event",
    content: summary.summary,
    scope: {
      characterId: summary.characterId,
      relationId: summary.relationId,
      userIdentityId: summary.userIdentityId,
      ...(summary.conversationId ? { conversationId: summary.conversationId } : {}),
    },
    visibility: "relation-private",
    status: summary.status === "retracted" ? "retracted" : summary.status,
    importance: 5,
    confidence: 0.7,
    userConfirmed: false,
    ...(summary.rangeStartAt !== undefined ? { occurredAt: summary.rangeStartAt } : {}),
    recordedAt: summary.generatedAt,
    ...(summary.rangeStartAt !== undefined ? { validFrom: summary.rangeStartAt } : {}),
    ...(summary.rangeEndAt !== undefined ? { validTo: summary.rangeEndAt } : {}),
    provenance: {
      app: "chat",
      kind: "summary",
      sourceRecordId: summary.sourceRecordId || summary.id,
      sourceMessageIds: uniqueStrings(summary.sourceMessageIds),
      sourceClaimIds: uniqueStrings(summary.sourceClaimIds),
    },
  };
}

export function memoryRecordFromBehaviorCorrection(correction: BehaviorCorrectionRecord): MemoryRecord {
  return {
    id: correction.id,
    schemaVersion: MEMORY_MODEL_SCHEMA_VERSION,
    layer: "rule",
    kind: "rule",
    content: correction.instruction,
    scope: {
      characterId: correction.characterId,
      relationId: correction.relationId,
      userIdentityId: correction.userIdentityId,
      ...(correction.conversationId ? { conversationId: correction.conversationId } : {}),
    },
    visibility: "relation-private",
    status: correction.status === "retracted"
      ? "retracted"
      : correction.status === "superseded"
        ? "superseded"
        : "active",
    importance: 10,
    confidence: 1,
    userConfirmed: true,
    recordedAt: correction.updatedAt,
    provenance: {
      app: "chat",
      kind: "manual",
      sourceRecordId: correction.sourceRecordId || correction.id,
      sourceMessageIds: uniqueStrings(correction.sourceMessageIds),
    },
    ...(correction.supersedesId ? { supersedesId: correction.supersedesId } : {}),
  };
}

export function isMemoryRecordCurrentlyActive(record: MemoryRecord, now = Date.now()): boolean {
  return record.status === "active"
    && (record.validFrom === undefined || record.validFrom <= now)
    && (record.validTo === undefined || record.validTo > now);
}

/**
 * Relation reads are deliberately exact.  A missing relationId is never a
 * wildcard over all relationships; legacy/unclassified data must be reviewed
 * or explicitly assigned before it can enter a private relationship prompt.
 */
export function isMemoryRecordVisibleToRelation(
  record: MemoryRecord,
  scope: MemoryRelationReadScope,
  now = Date.now(),
): boolean {
  return isMemoryRecordCurrentlyActive(record, now)
    && record.visibility === "relation-private"
    && record.scope.characterId === scope.characterId
    && record.scope.relationId === scope.relationId
    && (!record.scope.userIdentityId || record.scope.userIdentityId === scope.userIdentityId)
    && (!record.scope.conversationId || record.scope.conversationId === scope.conversationId);
}
