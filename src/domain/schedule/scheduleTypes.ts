export const SCHEDULE_SCHEMA_VERSION = 1 as const;

export type ScheduleEntryStatus =
  | "negotiating"
  | "confirmed"
  | "preparing"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired";

/**
 * V1 only exposes relationship appointments. The contract is intentionally
 * scoped now so later chat integration cannot leak an appointment between a
 * different character, relationship, or user identity.
 */
export interface ScheduleEntry {
  id: string;
  schemaVersion: typeof SCHEDULE_SCHEMA_VERSION;
  category: "appointment";
  title: string;
  status: ScheduleEntryStatus;
  dateKey?: string;
  relationId: string;
  characterId: string;
  userIdentityId: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleStore {
  schemaVersion: typeof SCHEDULE_SCHEMA_VERSION;
  entries: ScheduleEntry[];
}

export const EMPTY_SCHEDULE_STORE: ScheduleStore = {
  schemaVersion: SCHEDULE_SCHEMA_VERSION,
  entries: [],
};
