import { transitionAppointment } from "./appointmentPolicy";
import type { Appointment } from "./scheduleTypes";

export type AppointmentInvitationDecision = "accept" | "decline";

/**
 * Applies a user decision to a pending invitation. Keeping this mutation in
 * the domain makes clickable cards, keyboard actions and future notification
 * surfaces follow the exact same transition rules.
 */
export const decideAppointmentInvitation = (
  appointment: Appointment,
  decision: AppointmentInvitationDecision,
  now = Date.now(),
): Appointment | undefined => {
  const nextStatus = decision === "accept" ? "confirmed" : "declined";
  const result = transitionAppointment(appointment, nextStatus, now);
  return result.success ? result.appointment : undefined;
};

