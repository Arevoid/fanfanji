import type { CharacterLifeScope } from "./characterLifeTypes";

export const CHARACTER_SCHEDULE_SCHEMA_VERSION = 1 as const;

export type CharacterScheduleKind = "recurring_routine" | "one_off" | "flexible_block";
export type CharacterScheduleStatus = "scheduled" | "completed" | "cancelled" | "missed" | "postponed";
export type ScheduleRecurrence = "daily" | "weekly" | "weekdays";

export interface CharacterScheduleEntry extends CharacterLifeScope {
  id: string;
  schemaVersion: typeof CHARACTER_SCHEDULE_SCHEMA_VERSION;
  kind: CharacterScheduleKind;
  title: string;
  startAt?: number;
  endAt?: number;
  recurrence?: ScheduleRecurrence;
  status: CharacterScheduleStatus;
  postponedUntil?: number;
  linkedOpenLoopId?: string;
  sourceEventRefs: readonly string[];
  createdAt: number;
  updatedAt: number;
}

export interface CharacterScheduleStore {
  schemaVersion: typeof CHARACTER_SCHEDULE_SCHEMA_VERSION;
  entries: CharacterScheduleEntry[];
}

export const EMPTY_CHARACTER_SCHEDULE_STORE: CharacterScheduleStore = {
  schemaVersion: CHARACTER_SCHEDULE_SCHEMA_VERSION,
  entries: [],
};

const KINDS = new Set<CharacterScheduleKind>(["recurring_routine", "one_off", "flexible_block"]);
const STATUSES = new Set<CharacterScheduleStatus>(["scheduled", "completed", "cancelled", "missed", "postponed"]);
const RECURRENCES = new Set<ScheduleRecurrence>(["daily", "weekly", "weekdays"]);

const isFiniteTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const boundedRefs = (value: unknown): string[] => Array.from(new Set(
  Array.isArray(value) ? value.filter(isText).map((item) => item.trim()) : [],
)).slice(0, 24);

export const normalizeCharacterScheduleEntry = (value: unknown): CharacterScheduleEntry | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<CharacterScheduleEntry>;
  if (!isText(candidate.id) || !isText(candidate.relationId) || !isText(candidate.characterId)
    || !isText(candidate.userIdentityId) || candidate.schemaVersion !== CHARACTER_SCHEDULE_SCHEMA_VERSION
    || !isText(candidate.title) || !KINDS.has(candidate.kind as CharacterScheduleKind)
    || !STATUSES.has(candidate.status as CharacterScheduleStatus)
    || (candidate.recurrence !== undefined && !RECURRENCES.has(candidate.recurrence as ScheduleRecurrence))
    || !isFiniteTimestamp(candidate.createdAt) || !isFiniteTimestamp(candidate.updatedAt)
    || (candidate.startAt !== undefined && !isFiniteTimestamp(candidate.startAt))
    || (candidate.endAt !== undefined && !isFiniteTimestamp(candidate.endAt))
    || (candidate.postponedUntil !== undefined && !isFiniteTimestamp(candidate.postponedUntil))) return undefined;
  if (candidate.startAt !== undefined && candidate.endAt !== undefined && candidate.endAt < candidate.startAt) return undefined;
  return {
    id: candidate.id!.trim(),
    relationId: candidate.relationId!.trim(),
    characterId: candidate.characterId!.trim(),
    userIdentityId: candidate.userIdentityId!.trim(),
    schemaVersion: CHARACTER_SCHEDULE_SCHEMA_VERSION,
    kind: candidate.kind as CharacterScheduleKind,
    title: candidate.title!.trim().slice(0, 240),
    ...(candidate.startAt === undefined ? {} : { startAt: candidate.startAt }),
    ...(candidate.endAt === undefined ? {} : { endAt: candidate.endAt }),
    ...(candidate.recurrence ? { recurrence: candidate.recurrence } : {}),
    status: candidate.status as CharacterScheduleStatus,
    ...(candidate.postponedUntil === undefined ? {} : { postponedUntil: candidate.postponedUntil }),
    ...(isText(candidate.linkedOpenLoopId) ? { linkedOpenLoopId: candidate.linkedOpenLoopId!.trim() } : {}),
    sourceEventRefs: boundedRefs(candidate.sourceEventRefs),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
};

export const createCharacterScheduleEntry = (input: Omit<CharacterScheduleEntry, "schemaVersion" | "status" | "updatedAt"> & {
  status?: CharacterScheduleStatus;
  updatedAt?: number;
}): CharacterScheduleEntry | undefined => normalizeCharacterScheduleEntry({
  ...input,
  schemaVersion: CHARACTER_SCHEDULE_SCHEMA_VERSION,
  status: input.status || "scheduled",
  updatedAt: input.updatedAt ?? input.createdAt,
});

export const normalizeCharacterScheduleStore = (value: unknown): CharacterScheduleStore => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_CHARACTER_SCHEDULE_STORE };
  const candidate = value as Partial<CharacterScheduleStore>;
  if (candidate.schemaVersion !== CHARACTER_SCHEDULE_SCHEMA_VERSION || !Array.isArray(candidate.entries)) {
    return { ...EMPTY_CHARACTER_SCHEDULE_STORE };
  }
  const entries = candidate.entries.map(normalizeCharacterScheduleEntry).filter(
    (entry): entry is CharacterScheduleEntry => entry !== undefined,
  );
  const seen = new Set<string>();
  return {
    schemaVersion: CHARACTER_SCHEDULE_SCHEMA_VERSION,
    entries: entries.filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    }),
  };
};

const sameScope = (left: CharacterLifeScope, right: CharacterLifeScope): boolean =>
  left.relationId === right.relationId
  && left.characterId === right.characterId
  && left.userIdentityId === right.userIdentityId;

export const listCharacterSchedule = (
  entries: readonly CharacterScheduleEntry[],
  scope: CharacterLifeScope,
): CharacterScheduleEntry[] => entries
  .filter((entry) => sameScope(entry, scope))
  .sort((left, right) => (left.startAt ?? Number.MAX_SAFE_INTEGER) - (right.startAt ?? Number.MAX_SAFE_INTEGER));

export const upsertCharacterScheduleEntry = (
  store: CharacterScheduleStore,
  entry: CharacterScheduleEntry,
): CharacterScheduleStore => {
  const current = store.entries.find((candidate) => candidate.id === entry.id);
  if (current && !sameScope(current, entry)) return store;
  return {
    schemaVersion: CHARACTER_SCHEDULE_SCHEMA_VERSION,
    entries: current
      ? store.entries.map((candidate) => candidate.id === entry.id ? entry : candidate)
      : [...store.entries, entry],
  };
};

export const transitionCharacterSchedule = (
  entry: CharacterScheduleEntry,
  status: CharacterScheduleStatus,
  now: number,
  postponedUntil?: number,
): CharacterScheduleEntry | undefined => {
  if (!STATUSES.has(status) || !isFiniteTimestamp(now)) return undefined;
  if (status === "postponed" && !isFiniteTimestamp(postponedUntil)) return undefined;
  if (entry.status === "completed" || entry.status === "cancelled" || entry.status === "missed") return undefined;
  return {
    ...entry,
    status,
    ...(status === "postponed" ? { postponedUntil } : { postponedUntil: undefined }),
    updatedAt: now,
  };
};

/** Marks only one-off/flexible entries overdue; recurring routines remain reusable. */
export const deriveScheduleStatus = (entry: CharacterScheduleEntry, now: number): CharacterScheduleStatus => {
  if (entry.status !== "scheduled" || entry.kind === "recurring_routine" || !isFiniteTimestamp(now)) return entry.status;
  if ((entry.endAt !== undefined && entry.endAt < now)
    || (entry.endAt === undefined && entry.startAt !== undefined && entry.startAt < now)) return "missed";
  return entry.status;
};

export const isCharacterScheduleEntry = (value: unknown): value is CharacterScheduleEntry =>
  normalizeCharacterScheduleEntry(value) !== undefined;

export const isSameCharacterLifeScope = sameScope;
