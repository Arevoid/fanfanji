import type { CharacterScheduleEntry } from "../characterLife/scheduleRuntime";
import type { ScheduleEntry } from "./scheduleTypes";

export const USER_SCHEDULE_SCHEMA_VERSION = 1 as const;
export const PERIOD_SCHEMA_VERSION = 1 as const;

export type UserScheduleStatus = "scheduled" | "completed" | "cancelled";
export type CalendarReviewState = "confirmed" | "suggested";
export type CalendarSource =
  | "manual"
  | "appointment"
  | "character"
  | "worldbook"
  | "chat"
  | "phone"
  | "ai_generated"
  | "period";

export interface UserScheduleEntry {
  id: string;
  schemaVersion: typeof USER_SCHEDULE_SCHEMA_VERSION;
  userIdentityId: string;
  title: string;
  detail?: string;
  dateKey?: string;
  startAt?: number;
  endAt?: number;
  allDay?: boolean;
  status: UserScheduleStatus;
  source: "manual" | "ai_generated";
  reviewState: CalendarReviewState;
  recurrence?: "daily" | "weekly" | "weekdays";
  relationId?: string;
  characterId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserScheduleStore {
  schemaVersion: typeof USER_SCHEDULE_SCHEMA_VERSION;
  entries: UserScheduleEntry[];
}

export const EMPTY_USER_SCHEDULE_STORE: UserScheduleStore = {
  schemaVersion: USER_SCHEDULE_SCHEMA_VERSION,
  entries: [],
};

export interface PeriodRecord {
  id: string;
  schemaVersion: typeof PERIOD_SCHEMA_VERSION;
  userIdentityId: string;
  startDate: string;
  endDate?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PeriodStore {
  schemaVersion: typeof PERIOD_SCHEMA_VERSION;
  records: PeriodRecord[];
}

export const EMPTY_PERIOD_STORE: PeriodStore = {
  schemaVersion: PERIOD_SCHEMA_VERSION,
  records: [],
};

export type CalendarItemCategory = "period" | "appointment" | "character_schedule" | "user_schedule";
export type CalendarOwnerType = "user" | "character" | "shared";

export interface CalendarViewItem {
  id: string;
  category: CalendarItemCategory;
  ownerType: CalendarOwnerType;
  title: string;
  detail?: string;
  dateKey?: string;
  startAt?: number;
  endAt?: number;
  allDay?: boolean;
  status: string;
  reviewState: CalendarReviewState;
  source: CalendarSource;
  relationId?: string;
  characterId?: string;
  userIdentityId?: string;
  sourceId?: string;
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isTimestamp = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isDateKey = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);

export const normalizeUserScheduleEntry = (value: unknown): UserScheduleEntry | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<UserScheduleEntry>;
  if (!isText(candidate.id) || candidate.schemaVersion !== USER_SCHEDULE_SCHEMA_VERSION
    || !isText(candidate.userIdentityId) || !isText(candidate.title)
    || !["scheduled", "completed", "cancelled"].includes(candidate.status as string)
    || !["manual", "ai_generated"].includes(candidate.source as string)
    || !["confirmed", "suggested"].includes(candidate.reviewState as string)
    || (candidate.dateKey !== undefined && !isDateKey(candidate.dateKey))
    || (candidate.startAt !== undefined && !isTimestamp(candidate.startAt))
    || (candidate.endAt !== undefined && !isTimestamp(candidate.endAt))
    || !isTimestamp(candidate.createdAt) || !isTimestamp(candidate.updatedAt)) return undefined;
  if (candidate.startAt !== undefined && candidate.endAt !== undefined && candidate.endAt < candidate.startAt) return undefined;
  return {
    id: candidate.id.trim(),
    schemaVersion: USER_SCHEDULE_SCHEMA_VERSION,
    userIdentityId: candidate.userIdentityId.trim(),
    title: candidate.title.trim().slice(0, 240),
    ...(isText(candidate.detail) ? { detail: candidate.detail.trim().slice(0, 1000) } : {}),
    ...(isDateKey(candidate.dateKey) ? { dateKey: candidate.dateKey } : {}),
    ...(candidate.startAt === undefined ? {} : { startAt: candidate.startAt }),
    ...(candidate.endAt === undefined ? {} : { endAt: candidate.endAt }),
    ...(candidate.allDay ? { allDay: true } : {}),
    status: candidate.status as UserScheduleStatus,
    source: candidate.source as UserScheduleEntry["source"],
    reviewState: candidate.reviewState as CalendarReviewState,
    ...(candidate.recurrence ? { recurrence: candidate.recurrence } : {}),
    ...(isText(candidate.relationId) ? { relationId: candidate.relationId.trim() } : {}),
    ...(isText(candidate.characterId) ? { characterId: candidate.characterId.trim() } : {}),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
};

export const normalizeUserScheduleStore = (value: unknown): UserScheduleStore => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_USER_SCHEDULE_STORE };
  const candidate = value as Partial<UserScheduleStore>;
  if (candidate.schemaVersion !== USER_SCHEDULE_SCHEMA_VERSION || !Array.isArray(candidate.entries)) return { ...EMPTY_USER_SCHEDULE_STORE };
  const seen = new Set<string>();
  return {
    schemaVersion: USER_SCHEDULE_SCHEMA_VERSION,
    entries: candidate.entries.map(normalizeUserScheduleEntry).filter((entry): entry is UserScheduleEntry => {
      if (!entry || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    }),
  };
};

export const normalizePeriodRecord = (value: unknown): PeriodRecord | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<PeriodRecord>;
  if (!isText(candidate.id) || candidate.schemaVersion !== PERIOD_SCHEMA_VERSION
    || !isText(candidate.userIdentityId) || !isDateKey(candidate.startDate)
    || (candidate.endDate !== undefined && !isDateKey(candidate.endDate))
    || !isTimestamp(candidate.createdAt) || !isTimestamp(candidate.updatedAt)) return undefined;
  if (candidate.endDate && candidate.endDate < candidate.startDate) return undefined;
  return {
    id: candidate.id.trim(),
    schemaVersion: PERIOD_SCHEMA_VERSION,
    userIdentityId: candidate.userIdentityId.trim(),
    startDate: candidate.startDate,
    ...(candidate.endDate ? { endDate: candidate.endDate } : {}),
    ...(isText(candidate.note) ? { note: candidate.note.trim().slice(0, 500) } : {}),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
};

export const normalizePeriodStore = (value: unknown): PeriodStore => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_PERIOD_STORE };
  const candidate = value as Partial<PeriodStore>;
  if (candidate.schemaVersion !== PERIOD_SCHEMA_VERSION || !Array.isArray(candidate.records)) return { ...EMPTY_PERIOD_STORE };
  const seen = new Set<string>();
  return {
    schemaVersion: PERIOD_SCHEMA_VERSION,
    records: candidate.records.map(normalizePeriodRecord).filter((record): record is PeriodRecord => {
      if (!record || seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    }),
  };
};

const localDateKey = (timestamp?: number): string | undefined => {
  if (timestamp === undefined) return undefined;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const projectAppointmentCalendarItem = (entry: ScheduleEntry): CalendarViewItem => ({
  id: entry.id,
  category: "appointment",
  ownerType: "shared",
  title: entry.title,
  detail: [entry.activity, entry.location].filter(Boolean).join(" · ") || undefined,
  dateKey: entry.dateKey || localDateKey(entry.startAt),
  startAt: entry.startAt,
  endAt: entry.endAt,
  status: entry.status,
  reviewState: "confirmed",
  source: "appointment",
  relationId: entry.relationId,
  characterId: entry.characterId,
  userIdentityId: entry.userIdentityId,
  sourceId: entry.appointmentId,
});

export const projectCharacterScheduleCalendarItem = (entry: CharacterScheduleEntry): CalendarViewItem => ({
  id: entry.id,
  category: "character_schedule",
  ownerType: "character",
  title: entry.title,
  detail: entry.detail,
  dateKey: entry.dateKey || localDateKey(entry.startAt),
  startAt: entry.startAt,
  endAt: entry.endAt,
  status: entry.status,
  reviewState: entry.reviewState || "confirmed",
  source: entry.source || "character",
  relationId: entry.relationId,
  characterId: entry.characterId,
  userIdentityId: entry.userIdentityId,
  sourceId: entry.id,
});

export const projectUserScheduleCalendarItem = (entry: UserScheduleEntry): CalendarViewItem => ({
  id: entry.id,
  category: "user_schedule",
  ownerType: "user",
  title: entry.title,
  detail: entry.detail,
  dateKey: entry.dateKey || localDateKey(entry.startAt),
  startAt: entry.startAt,
  endAt: entry.endAt,
  allDay: entry.allDay,
  status: entry.status,
  reviewState: entry.reviewState,
  source: entry.source,
  relationId: entry.relationId,
  characterId: entry.characterId,
  userIdentityId: entry.userIdentityId,
  sourceId: entry.id,
});
