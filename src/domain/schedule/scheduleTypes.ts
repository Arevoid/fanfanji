export const SCHEDULE_SCHEMA_VERSION = 1 as const;

export interface ScheduleScope {
  relationId: string;
  characterId: string;
  userIdentityId: string;
}

export type AppointmentInitiator = "character" | "user";
export type AppointmentMode = "immediate" | "scheduled";
export type AppointmentActor = "character" | "user" | "both" | "undetermined";
export type AppointmentTimePrecision = "exact" | "morning" | "afternoon" | "evening" | "date_only" | "undetermined";

export type AppointmentStatus =
  | "draft"
  | "awaiting_user"
  | "negotiating"
  | "confirmed"
  | "preparing"
  | "ready"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

export interface AppointmentProposal {
  id: string;
  proposedBy: AppointmentInitiator;
  proposedAt: number;
  startAt?: number;
  endAt?: number;
  timePrecision: AppointmentTimePrecision;
  activity?: string;
  location?: string;
  traveler: AppointmentActor;
  transport?: string;
  status: "active" | "superseded" | "rejected";
  sourceMessageIds: string[];
}

/** The appointment is the single persisted source of truth. */
export interface Appointment extends ScheduleScope {
  id: string;
  schemaVersion: typeof SCHEDULE_SCHEMA_VERSION;
  title: string;
  initiator: AppointmentInitiator;
  mode: AppointmentMode;
  status: AppointmentStatus;
  proposals: AppointmentProposal[];
  currentProposalId?: string;
  sourceMessageIds: string[];
  confirmedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type ScheduleEntryStatus = "confirmed" | "preparing" | "ready" | "in_progress" | "completed" | "cancelled" | "expired";

/** Read-only calendar projection derived from a confirmed appointment. */
export interface ScheduleEntry extends ScheduleScope {
  id: string;
  schemaVersion: typeof SCHEDULE_SCHEMA_VERSION;
  category: "appointment";
  appointmentId: string;
  title: string;
  status: ScheduleEntryStatus;
  dateKey?: string;
  startAt?: number;
  endAt?: number;
  timePrecision: AppointmentTimePrecision;
  activity?: string;
  location?: string;
  traveler: AppointmentActor;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleStore {
  schemaVersion: typeof SCHEDULE_SCHEMA_VERSION;
  appointments: Appointment[];
}

export const EMPTY_SCHEDULE_STORE: ScheduleStore = {
  schemaVersion: SCHEDULE_SCHEMA_VERSION,
  appointments: [],
};
