import { isSameScheduleScope } from "./scheduleScope";
import type { Appointment, AppointmentMode, ScheduleScope } from "./scheduleTypes";

export const PROACTIVE_OFFLINE_MIN_COOLDOWN_MS = 72 * 60 * 60 * 1000;
export const PROACTIVE_OFFLINE_DECLINE_BACKOFF_MS = 7 * 24 * 60 * 60 * 1000;
export const PROACTIVE_OFFLINE_ROLLING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const PROACTIVE_OFFLINE_MAX_INVITATIONS_PER_WINDOW = 2;

const OPEN_APPOINTMENT_STATUSES = new Set<Appointment["status"]>([
  "draft", "awaiting_user", "negotiating", "confirmed", "preparing", "ready", "in_progress",
]);

export type OfflineTravelFeasibility =
  | "same_area"
  | "planned_travel"
  | "travel_possible"
  | "unknown"
  | "impossible";

export interface ProactiveOfflineContextEvidence {
  /** A concrete conversational or life-context reason exists; generic randomness is not enough. */
  hasNaturalLeadIn: boolean;
  /** Explicit unavailability always wins over inferred interest. */
  userExplicitlyUnavailable?: boolean;
  /** Factual travel/location evidence only; never inferred from affection or relationship labels. */
  travelFeasibility: OfflineTravelFeasibility;
}

export type ProactiveOfflineBlockReason =
  | "disabled"
  | "active_appointment"
  | "recent_decline"
  | "cooldown"
  | "rolling_limit"
  | "no_natural_lead_in"
  | "user_unavailable"
  | "travel_unresolved";

export type ProactiveOfflineEligibility =
  | { eligible: true; allowedModes: AppointmentMode[] }
  | { eligible: false; allowedModes: []; reason: ProactiveOfflineBlockReason };

const block = (reason: ProactiveOfflineBlockReason): ProactiveOfflineEligibility => ({
  eligible: false,
  allowedModes: [],
  reason,
});

/**
 * Hard safety/consistency gate only. Persona, relationship style, affection and
 * wording are deliberately absent so this policy cannot flatten characters.
 */
export function evaluateProactiveOfflineEligibility(input: {
  enabled: boolean;
  scope: ScheduleScope;
  appointments: readonly Appointment[];
  context: ProactiveOfflineContextEvidence;
  now?: number;
}): ProactiveOfflineEligibility {
  if (!input.enabled) return block("disabled");
  const now = input.now ?? Date.now();
  const scoped = input.appointments.filter((appointment) => isSameScheduleScope(appointment, input.scope));
  if (scoped.some((appointment) => OPEN_APPOINTMENT_STATUSES.has(appointment.status))) {
    return block("active_appointment");
  }

  const characterInvitations = scoped
    .filter((appointment) => appointment.initiator === "character" && appointment.createdAt <= now)
    .sort((left, right) => right.createdAt - left.createdAt);
  const recentDecline = characterInvitations.find((appointment) => appointment.status === "declined");
  if (recentDecline && now - recentDecline.updatedAt < PROACTIVE_OFFLINE_DECLINE_BACKOFF_MS) {
    return block("recent_decline");
  }
  const latestInvitation = characterInvitations[0];
  if (latestInvitation && now - latestInvitation.createdAt < PROACTIVE_OFFLINE_MIN_COOLDOWN_MS) {
    return block("cooldown");
  }
  const rollingCount = characterInvitations.filter(
    (appointment) => now - appointment.createdAt < PROACTIVE_OFFLINE_ROLLING_WINDOW_MS,
  ).length;
  if (rollingCount >= PROACTIVE_OFFLINE_MAX_INVITATIONS_PER_WINDOW) return block("rolling_limit");

  if (input.context.userExplicitlyUnavailable) return block("user_unavailable");
  if (!input.context.hasNaturalLeadIn) return block("no_natural_lead_in");

  if (input.context.travelFeasibility === "same_area") {
    return { eligible: true, allowedModes: ["immediate", "scheduled"] };
  }
  if (input.context.travelFeasibility === "planned_travel" || input.context.travelFeasibility === "travel_possible") {
    return { eligible: true, allowedModes: ["scheduled"] };
  }
  return block("travel_unresolved");
}
