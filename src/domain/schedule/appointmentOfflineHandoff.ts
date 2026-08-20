import { getCurrentAppointmentProposal, transitionAppointment } from "./appointmentPolicy";
import type { Appointment } from "./scheduleTypes";

export function isAppointmentReadyForOfflineEntry(appointment: Appointment, now = Date.now()): boolean {
  if (appointment.status !== "confirmed" && appointment.status !== "ready") return false;
  if (appointment.mode === "immediate") return true;
  const proposal = getCurrentAppointmentProposal(appointment);
  return proposal?.startAt !== undefined && proposal.startAt <= now;
}

/** Advances through the explicit lifecycle without allowing callers to skip arbitrary states. */
export function startAppointmentOfflineSession(appointment: Appointment, now = Date.now()): Appointment | undefined {
  if (appointment.status === "in_progress") return appointment;
  if (!isAppointmentReadyForOfflineEntry(appointment, now)) return undefined;
  let current = appointment;
  if (current.status === "confirmed") {
    const transition = transitionAppointment(current, "preparing", now);
    if (!transition.success) return undefined;
    current = transition.appointment;
  }
  if (current.status === "preparing") {
    const transition = transitionAppointment(current, "ready", now);
    if (!transition.success) return undefined;
    current = transition.appointment;
  }
  if (current.status === "ready") {
    const transition = transitionAppointment(current, "in_progress", now);
    if (!transition.success) return undefined;
    current = transition.appointment;
  }
  return current;
}

export function completeAppointmentOfflineSession(appointment: Appointment, now = Date.now()): Appointment | undefined {
  if (appointment.status === "completed") return appointment;
  const transition = transitionAppointment(appointment, "completed", now);
  return transition.success ? transition.appointment : undefined;
}
