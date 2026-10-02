import assert from "node:assert/strict";
import { decideAppointmentInvitation } from "../src/domain/schedule/appointmentInvitation";
import { getCurrentAppointmentProposal, normalizeAppointment } from "../src/domain/schedule/appointmentPolicy";
import { projectAppointmentToScheduleEntry } from "../src/domain/schedule/scheduleProjection";
import type { Appointment } from "../src/domain/schedule/scheduleTypes";

const immediate: Appointment = {
  id: "appointment-immediate-test",
  schemaVersion: 1,
  relationId: "relation-test",
  characterId: "character-test",
  userIdentityId: "identity-test",
  title: "现在见面",
  initiator: "character",
  mode: "immediate",
  status: "awaiting_user",
  proposals: [{
    id: "proposal-immediate-test",
    proposedBy: "character",
    proposedAt: 100,
    timePrecision: "undetermined",
    activity: "一起喝咖啡",
    traveler: "both",
    status: "active",
    sourceMessageIds: ["message-test"],
  }],
  currentProposalId: "proposal-immediate-test",
  sourceMessageIds: ["message-test"],
  createdAt: 100,
  updatedAt: 100,
};

const confirmed = decideAppointmentInvitation(immediate, "accept", 200);
assert.ok(confirmed);
assert.equal(confirmed.status, "confirmed");
assert.equal(confirmed.confirmedAt, 200);
assert.equal(getCurrentAppointmentProposal(confirmed)?.startAt, 200);
assert.equal(getCurrentAppointmentProposal(confirmed)?.timePrecision, "exact");
assert.ok(normalizeAppointment(confirmed), "confirmed immediate invitations must remain persistable");
const entry = projectAppointmentToScheduleEntry(confirmed);
assert.ok(entry);
assert.equal(entry.startAt, 200);
assert.equal(entry.dateKey, new Date(200).toISOString().slice(0, 10));

const declined = decideAppointmentInvitation(immediate, "decline", 300);
assert.ok(declined);
assert.equal(declined.status, "declined");
assert.equal(projectAppointmentToScheduleEntry(declined), undefined);

const scheduled = {
  ...immediate,
  id: "appointment-scheduled-test",
  mode: "scheduled" as const,
  proposals: [{
    ...immediate.proposals[0],
    id: "proposal-scheduled-test",
    startAt: 1_000,
    timePrecision: "undetermined" as const,
  }],
  currentProposalId: "proposal-scheduled-test",
};
const scheduledAccepted = decideAppointmentInvitation(scheduled, "accept", 200);
assert.ok(scheduledAccepted, "a future timestamp is enough to accept a scheduled invitation");
assert.equal(getCurrentAppointmentProposal(scheduledAccepted)?.startAt, 1_000);
assert.equal(getCurrentAppointmentProposal(scheduledAccepted)?.timePrecision, "exact", "confirmation repairs an omitted precision label");
assert.ok(normalizeAppointment(scheduledAccepted));

console.log("PASS appointment invitation decisions and immediate calendar projection");
