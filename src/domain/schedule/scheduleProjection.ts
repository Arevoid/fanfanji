import { getCurrentAppointmentProposal } from "./appointmentPolicy";
import type { Appointment, ScheduleEntry, ScheduleEntryStatus } from "./scheduleTypes";

const PROJECTED_STATUSES = new Set<ScheduleEntryStatus>([
  "confirmed", "preparing", "ready", "in_progress", "completed", "cancelled", "expired",
]);

const toLocalDateKey = (timestamp: number | undefined): string | undefined => {
  if (timestamp === undefined) return undefined;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Draft, pending, negotiating, or declined invitations never become calendar facts. */
export const projectAppointmentToScheduleEntry = (appointment: Appointment): ScheduleEntry | undefined => {
  if (appointment.confirmedAt === undefined || !PROJECTED_STATUSES.has(appointment.status as ScheduleEntryStatus)) return undefined;
  const proposal = getCurrentAppointmentProposal(appointment);
  if (!proposal) return undefined;
  // Immediate invitations can be confirmed without a clock time. Treat the
  // confirmation moment as their completed/active calendar anchor so the
  // accepted visit appears in both linked schedule views.
  const effectiveStartAt = proposal.startAt ?? (appointment.mode === "immediate" ? appointment.confirmedAt : undefined);
  return {
    id: `schedule:${appointment.id}`,
    schemaVersion: appointment.schemaVersion,
    category: "appointment",
    appointmentId: appointment.id,
    title: appointment.title,
    status: appointment.status as ScheduleEntryStatus,
    ...(toLocalDateKey(effectiveStartAt) ? { dateKey: toLocalDateKey(effectiveStartAt) } : {}),
    ...(effectiveStartAt === undefined ? {} : { startAt: effectiveStartAt }),
    ...(proposal.endAt === undefined ? {} : { endAt: proposal.endAt }),
    timePrecision: proposal.timePrecision,
    ...(proposal.activity ? { activity: proposal.activity } : {}),
    ...(proposal.location ? { location: proposal.location } : {}),
    traveler: proposal.traveler,
    relationId: appointment.relationId,
    characterId: appointment.characterId,
    userIdentityId: appointment.userIdentityId,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
};

export const projectAppointmentsToScheduleEntries = (appointments: readonly Appointment[]): ScheduleEntry[] =>
  appointments
    .map(projectAppointmentToScheduleEntry)
    .filter((entry): entry is ScheduleEntry => entry !== undefined)
    .sort((left, right) => (left.startAt ?? Number.MAX_SAFE_INTEGER) - (right.startAt ?? Number.MAX_SAFE_INTEGER));
