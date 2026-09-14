import type { CharacterLifeScope } from "./characterLifeTypes";
import {
  CHARACTER_EVENT_SCHEMA_VERSION,
  type CharacterEvent,
  type CharacterEventInterval,
  type CharacterEventVisibility,
} from "./characterEventTypes";

export type LifeEventStatus = "planned" | "ongoing" | "completed" | "cancelled" | "missed";
export type LifeEventVisibility = CharacterEventVisibility;

export interface LifeEvent extends CharacterLifeScope {
  id: string;
  schemaVersion: typeof CHARACTER_EVENT_SCHEMA_VERSION;
  type: string;
  summary: string;
  timestamp: number;
  interval?: CharacterEventInterval;
  participants: readonly string[];
  source: string;
  visibility: LifeEventVisibility;
  status: LifeEventStatus;
  refs: readonly string[];
  recordedAt: number;
}

export type LifeEventInput = Omit<LifeEvent, "schemaVersion" | "recordedAt"> & {
  schemaVersion?: number;
  recordedAt?: number;
};

const STATUSES = new Set<LifeEventStatus>(["planned", "ongoing", "completed", "cancelled", "missed"]);
const VISIBILITIES = new Set<LifeEventVisibility>(["private", "shared", "public", "character_private", "user_private"]);
const boundedStrings = (value: unknown, max: number): string[] => Array.from(new Set(
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [],
)).slice(0, max);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export const normalizeLifeEvent = (value: unknown, now = Date.now()): LifeEvent | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<LifeEvent> & { kind?: string; occurredAt?: number };
  const type = typeof candidate.type === "string" && candidate.type.trim()
    ? candidate.type.trim()
    : typeof candidate.kind === "string" && candidate.kind.trim() ? candidate.kind.trim() : undefined;
  const timestamp = finite(candidate.timestamp) ? candidate.timestamp : finite(candidate.occurredAt) ? candidate.occurredAt : undefined;
  const status = STATUSES.has(candidate.status as LifeEventStatus) ? candidate.status as LifeEventStatus : "completed";
  const visibility = VISIBILITIES.has(candidate.visibility as LifeEventVisibility)
    ? candidate.visibility as LifeEventVisibility : "character_private";
  if (candidate.schemaVersion !== undefined && candidate.schemaVersion !== CHARACTER_EVENT_SCHEMA_VERSION
    || typeof candidate.id !== "string" || !candidate.id.trim()
    || typeof candidate.relationId !== "string" || !candidate.relationId.trim()
    || typeof candidate.characterId !== "string" || !candidate.characterId.trim()
    || typeof candidate.userIdentityId !== "string" || !candidate.userIdentityId.trim()
    || !type || typeof candidate.summary !== "string" || !candidate.summary.trim()
    || timestamp === undefined || !finite(candidate.recordedAt ?? now)
    || typeof candidate.source !== "string" || !candidate.source.trim()) return undefined;
  const interval = candidate.interval && finite(candidate.interval.startAt)
    ? { startAt: candidate.interval.startAt, ...(finite(candidate.interval.endAt) ? { endAt: candidate.interval.endAt } : {}) }
    : undefined;
  if (interval?.endAt !== undefined && interval.endAt < interval.startAt) return undefined;
  return {
    id: candidate.id.trim(),
    relationId: candidate.relationId.trim(),
    characterId: candidate.characterId.trim(),
    userIdentityId: candidate.userIdentityId.trim(),
    schemaVersion: CHARACTER_EVENT_SCHEMA_VERSION,
    type,
    summary: candidate.summary.trim().slice(0, 600),
    timestamp,
    ...(interval ? { interval } : {}),
    participants: boundedStrings(candidate.participants, 16),
    source: candidate.source.trim().slice(0, 120),
    visibility,
    status,
    refs: boundedStrings(candidate.refs, 24),
    recordedAt: candidate.recordedAt ?? now,
  };
};

export const createLifeEvent = (input: LifeEventInput): LifeEvent | undefined => normalizeLifeEvent({
  ...input,
  schemaVersion: CHARACTER_EVENT_SCHEMA_VERSION,
  recordedAt: input.recordedAt ?? input.timestamp,
});

export const lifeEventToCharacterEvent = (event: LifeEvent): CharacterEvent => ({
  id: event.id,
  relationId: event.relationId,
  characterId: event.characterId,
  userIdentityId: event.userIdentityId,
  kind: event.type,
  type: event.type,
  summary: event.summary,
  source: event.source,
  occurredAt: event.timestamp,
  timestamp: event.timestamp,
  ...(event.interval ? { interval: event.interval } : {}),
  participants: event.participants,
  visibility: event.visibility,
  status: event.status,
  refs: event.refs,
  recordedAt: event.recordedAt,
  confidence: 1,
  schemaVersion: CHARACTER_EVENT_SCHEMA_VERSION,
});

export const transitionLifeEvent = (
  event: LifeEvent,
  status: LifeEventStatus,
  now: number,
): LifeEvent | undefined => {
  if (!STATUSES.has(status) || !finite(now)) return undefined;
  if (event.status === "completed" || event.status === "cancelled" || event.status === "missed") return undefined;
  return { ...event, status, recordedAt: now };
};

/** Planned events become overdue only from their real interval/end timestamp. */
export const deriveLifeEventStatus = (event: LifeEvent, now: number): LifeEventStatus => {
  if ((event.status !== "planned" && event.status !== "ongoing") || !finite(now)) return event.status;
  const endAt = event.interval?.endAt;
  return endAt !== undefined && endAt < now ? "missed" : event.status;
};

export const isLifeEvent = (value: unknown): value is LifeEvent => normalizeLifeEvent(value) !== undefined;
