import assert from "node:assert/strict";
import { confirmAppointmentWithTime, formatAppointmentLocalTime, needsAppointmentTimeSelection, parseAppointmentLocalTime } from "../src/domain/schedule/appointmentConfirmation";
import { getCurrentAppointmentProposal, normalizeAppointment } from "../src/domain/schedule/appointmentPolicy";
import { decideAppointmentInvitation } from "../src/domain/schedule/appointmentInvitation";
import { projectAppointmentToScheduleEntry } from "../src/domain/schedule/scheduleProjection";
import { upsertAppointment } from "../src/core/storage/repositories/scheduleRepository";
import type { Appointment } from "../src/domain/schedule/scheduleTypes";

const now = Date.UTC(2026, 9, 20, 5), future = now + 86_400_000;
const pending: Appointment = {
  id: "old-invitation", schemaVersion: 1, relationId: "r", characterId: "c", userIdentityId: "u",
  title: "咖啡和散步", initiator: "character", mode: "scheduled", status: "awaiting_user",
  proposals: [{ id: "p", proposedBy: "character", proposedAt: now - 1000, timePrecision: "undetermined", activity: "咖啡和散步", traveler: "both", status: "active", sourceMessageIds: ["source"] }],
  currentProposalId: "p", sourceMessageIds: ["source"], createdAt: now - 1000, updatedAt: now - 1000,
};
const before = JSON.stringify(pending);
assert.equal(needsAppointmentTimeSelection(pending, now), true);
assert.equal(decideAppointmentInvitation(pending, "accept", now), undefined, "do not bypass the scheduled-time truth boundary");
const confirmed = confirmAppointmentWithTime(pending, future, "  湖边咖啡馆  ", now)!;
assert.ok(normalizeAppointment(confirmed));
assert.equal(confirmed.id, pending.id); assert.equal(confirmed.mode, "scheduled"); assert.equal(confirmed.status, "confirmed");
assert.equal(confirmed.proposals[0].status, "superseded");
assert.equal(getCurrentAppointmentProposal(confirmed)?.startAt, future);
assert.equal(getCurrentAppointmentProposal(confirmed)?.location, "湖边咖啡馆");
assert.equal(getCurrentAppointmentProposal(confirmed)?.timePrecision, "exact");
assert.equal(JSON.stringify(pending), before, "cancel/failed save cannot mutate the original invitation");
assert.deepEqual([confirmed.relationId, confirmed.characterId, confirmed.userIdentityId], ["r", "c", "u"]);
const first = upsertAppointment({ schemaVersion: 1, appointments: [pending] }, confirmed);
assert.ok(first.success);
const reloaded = JSON.parse(JSON.stringify(first.store));
assert.equal(reloaded.appointments.length, 1);
assert.equal(projectAppointmentToScheduleEntry(reloaded.appointments[0])?.startAt, future);
assert.equal(upsertAppointment(reloaded, { ...confirmed, relationId: "foreign" }).success, false);
assert.equal(confirmAppointmentWithTime(confirmed, future, "", now), undefined, "confirmed invitation cannot be accepted again");
for (const status of ["cancelled", "declined", "expired", "completed"] as const)
  assert.equal(confirmAppointmentWithTime({ ...pending, status }, future, "", now), undefined);
for (const invalid of [NaN, Infinity, now, now - 1]) assert.equal(confirmAppointmentWithTime(pending, invalid, "", now), undefined);
const exact = { ...pending, proposals: [{ ...pending.proposals[0], startAt: future, timePrecision: "exact" as const }] };
assert.equal(needsAppointmentTimeSelection(exact, now), false);
assert.equal(needsAppointmentTimeSelection({ ...exact, proposals: [{ ...exact.proposals[0], startAt: now - 1 }] }, now), true);
for (const timePrecision of ["morning", "afternoon", "evening", "date_only"] as const)
  assert.equal(needsAppointmentTimeSelection({ ...exact, proposals: [{ ...exact.proposals[0], timePrecision }] }, now), true);
assert.equal(needsAppointmentTimeSelection({ ...pending, mode: "immediate" }, now), false);
assert.equal(decideAppointmentInvitation({ ...pending, mode: "immediate" }, "accept", now)?.status, "confirmed");
assert.equal(parseAppointmentLocalTime(formatAppointmentLocalTime(future)), future);
for (const invalid of ["", "2026-02-31T12:00", "2026-13-20T12:00", "2026-10-20", "tomorrow"])
  assert.equal(parseAppointmentLocalTime(invalid), undefined);
console.log("PASS missing-time invitations: atomic confirmation, history, projection/reload, duplicate/status/scope guards, explicit future local-time selection");
