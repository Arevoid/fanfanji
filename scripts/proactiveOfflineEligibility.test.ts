import assert from "node:assert/strict";
import {
  PROACTIVE_OFFLINE_DECLINE_BACKOFF_MS,
  PROACTIVE_OFFLINE_MAX_INVITATIONS_PER_WINDOW,
  PROACTIVE_OFFLINE_MIN_COOLDOWN_MS,
  evaluateProactiveOfflineEligibility,
  type ProactiveOfflineContextEvidence,
} from "../src/domain/schedule/proactiveOfflineEligibility";
import { SCHEDULE_SCHEMA_VERSION, type Appointment, type ScheduleScope } from "../src/domain/schedule/scheduleTypes";

const now = new Date(2026, 7, 13, 12, 0, 0).getTime();
const scope: ScheduleScope = { relationId: "relation-a", characterId: "character-a", userIdentityId: "identity-a" };
const context = (overrides: Partial<ProactiveOfflineContextEvidence> = {}): ProactiveOfflineContextEvidence => ({
  hasNaturalLeadIn: true,
  travelFeasibility: "same_area",
  ...overrides,
});
const history = (id: string, createdAt: number, status: Appointment["status"] = "cancelled"): Appointment => ({
  ...scope,
  id,
  schemaVersion: SCHEDULE_SCHEMA_VERSION,
  title: "见面",
  initiator: "character",
  mode: "scheduled",
  status,
  proposals: [],
  sourceMessageIds: [],
  createdAt,
  updatedAt: createdAt,
});
const evaluate = (overrides: Partial<Parameters<typeof evaluateProactiveOfflineEligibility>[0]> = {}) =>
  evaluateProactiveOfflineEligibility({ enabled: true, scope, appointments: [], context: context(), now, ...overrides });

assert.deepEqual(evaluate({ enabled: false }), { eligible: false, allowedModes: [], reason: "disabled" });
assert.deepEqual(evaluate({ context: context({ hasNaturalLeadIn: false }) }), { eligible: false, allowedModes: [], reason: "no_natural_lead_in" });
assert.deepEqual(evaluate({ context: context({ userExplicitlyUnavailable: true }) }), { eligible: false, allowedModes: [], reason: "user_unavailable" });
assert.deepEqual(evaluate({ context: context({ travelFeasibility: "unknown" }) }), { eligible: false, allowedModes: [], reason: "travel_unresolved" });
assert.deepEqual(evaluate({ context: context({ travelFeasibility: "impossible" }) }), { eligible: false, allowedModes: [], reason: "travel_unresolved" });
assert.deepEqual(evaluate({ context: context({ travelFeasibility: "travel_possible" }) }), { eligible: true, allowedModes: ["scheduled"] });
assert.deepEqual(evaluate({ context: context({ travelFeasibility: "planned_travel" }) }), { eligible: true, allowedModes: ["scheduled"] });
assert.deepEqual(evaluate(), { eligible: true, allowedModes: ["immediate", "scheduled"] });

assert.deepEqual(evaluate({ appointments: [history("open", now - 10_000, "awaiting_user")] }), { eligible: false, allowedModes: [], reason: "active_appointment" });
assert.deepEqual(evaluate({ appointments: [history("recent", now - PROACTIVE_OFFLINE_MIN_COOLDOWN_MS + 1)] }), { eligible: false, allowedModes: [], reason: "cooldown" });
const declined = history("declined", now - PROACTIVE_OFFLINE_MIN_COOLDOWN_MS - 1, "declined");
declined.updatedAt = now - PROACTIVE_OFFLINE_DECLINE_BACKOFF_MS + 1;
assert.deepEqual(evaluate({ appointments: [declined] }), { eligible: false, allowedModes: [], reason: "recent_decline" });
const rollingHistory = Array.from({ length: PROACTIVE_OFFLINE_MAX_INVITATIONS_PER_WINDOW }, (_, index) =>
  history(`old-${index}`, now - PROACTIVE_OFFLINE_MIN_COOLDOWN_MS - 1 - index * 60_000));
assert.deepEqual(evaluate({ appointments: rollingHistory }), { eligible: false, allowedModes: [], reason: "rolling_limit" });

const foreign = { ...history("foreign", now - 10_000), relationId: "relation-b" };
assert.deepEqual(evaluate({ appointments: [foreign] }), { eligible: true, allowedModes: ["immediate", "scheduled"] }, "another relationship must not consume this relationship's invitation quota");

console.log("PASS proactive offline eligibility blocks unsupported distance and repetition while preserving immediate and planned-travel modes");
