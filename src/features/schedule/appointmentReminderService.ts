import { readJson, writeJson } from "../../core/storage/storageAdapter";
import { storageKeys } from "../../core/storage/storageKeys";
import { getCurrentAppointmentProposal } from "../../domain/schedule/appointmentPolicy";
import type { Appointment } from "../../domain/schedule/scheduleTypes";

export const APPOINTMENT_REMINDER_LEAD_MS = 15 * 60 * 1000;
export const APPOINTMENT_DUE_GRACE_MS = 2 * 60 * 60 * 1000;
const REMINDER_RETENTION_LIMIT = 400;
const REMINDER_ELIGIBLE_STATUSES = new Set<Appointment["status"]>(["confirmed", "preparing", "ready"]);

export type AppointmentReminderKind = "upcoming" | "due";

export interface AppointmentReminder {
  key: string;
  kind: AppointmentReminderKind;
  appointmentId: string;
  title: string;
  startAt: number;
  relationId: string;
  characterId: string;
  userIdentityId: string;
}

export const getAppointmentReminder = (appointment: Appointment, now = Date.now()): AppointmentReminder | undefined => {
  if (!REMINDER_ELIGIBLE_STATUSES.has(appointment.status)) return undefined;
  const proposal = getCurrentAppointmentProposal(appointment);
  if (proposal?.startAt === undefined || !Number.isFinite(proposal.startAt)) return undefined;
  if (proposal.startAt < now - APPOINTMENT_DUE_GRACE_MS) return undefined;
  const kind: AppointmentReminderKind = proposal.startAt <= now ? "due" : "upcoming";
  if (kind === "upcoming" && proposal.startAt - now > APPOINTMENT_REMINDER_LEAD_MS) return undefined;
  return {
    key: `${appointment.id}:${kind}:${proposal.startAt}`,
    kind,
    appointmentId: appointment.id,
    title: proposal.activity || appointment.title,
    startAt: proposal.startAt,
    relationId: appointment.relationId,
    characterId: appointment.characterId,
    userIdentityId: appointment.userIdentityId,
  };
};

/** Claims a reminder idempotently so timer sweeps and page-show recovery do not duplicate notices. */
export const claimAppointmentReminder = (reminder: AppointmentReminder): boolean => {
  const loaded = readJson<Record<string, number>>(storageKeys.scheduleAppointmentReminders, {}).value;
  if (loaded[reminder.key] !== undefined) return false;
  const nextEntries = Object.entries(loaded)
    .concat([[reminder.key, Date.now()]])
    .sort((left, right) => right[1] - left[1])
    .slice(0, REMINDER_RETENTION_LIMIT);
  return writeJson(storageKeys.scheduleAppointmentReminders, Object.fromEntries(nextEntries)).success;
};
