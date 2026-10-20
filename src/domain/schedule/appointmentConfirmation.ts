import { appendAppointmentProposal, getCurrentAppointmentProposal, transitionAppointment } from "./appointmentPolicy";
import type { Appointment } from "./scheduleTypes";

/** Missing, elapsed or approximate scheduled times need an explicit user choice. */
export function needsAppointmentTimeSelection(appointment: Appointment, now = Date.now()): boolean {
  if (appointment.mode === "immediate") return false;
  const proposal = getCurrentAppointmentProposal(appointment);
  return !proposal || !Number.isFinite(proposal.startAt) || proposal.startAt! <= now
    || ["morning", "afternoon", "evening", "date_only"].includes(proposal.timePrecision);
}

/** Build the final confirmed record without persisting an intermediate proposal. */
export function confirmAppointmentWithTime(appointment: Appointment, startAt: number, location: string, now = Date.now()): Appointment | undefined {
  const previous = getCurrentAppointmentProposal(appointment);
  if (appointment.mode !== "scheduled" || !previous || !Number.isFinite(startAt) || startAt <= now
    || location.trim().length > 200) return undefined;
  const proposal = appendAppointmentProposal(appointment, {
    id: `${previous.id}:user-time:${now}`,
    proposedBy: "user", proposedAt: now, startAt, timePrecision: "exact",
    ...(previous.activity ? { activity: previous.activity } : {}),
    ...(location.trim() ? { location: location.trim() } : {}),
    traveler: previous.traveler, ...(previous.transport ? { transport: previous.transport } : {}),
    ...(previous.startAt !== undefined && previous.endAt !== undefined && previous.endAt >= previous.startAt
      ? { endAt: startAt + previous.endAt - previous.startAt } : {}),
    status: "active", sourceMessageIds: previous.sourceMessageIds,
  }, now);
  if (!proposal.success) return undefined;
  const confirmed = transitionAppointment(proposal.appointment, "confirmed", now);
  return confirmed.success ? confirmed.appointment : undefined;
}

export function formatAppointmentLocalTime(timestamp: number): string {
  const date = new Date(timestamp), pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseAppointmentLocalTime(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && formatAppointmentLocalTime(timestamp) === value ? timestamp : undefined;
}
