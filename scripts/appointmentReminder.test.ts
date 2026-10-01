import assert from "node:assert/strict";
import { claimAppointmentReminder, getAppointmentReminder } from "../src/features/schedule/appointmentReminderService";
import type { Appointment } from "../src/domain/schedule/scheduleTypes";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });

const startAt = 1_000_000;
const appointment: Appointment = {
  id: "appointment-reminder-test",
  schemaVersion: 1,
  relationId: "relation-test",
  characterId: "character-test",
  userIdentityId: "identity-test",
  title: "见面",
  initiator: "character",
  mode: "scheduled",
  status: "confirmed",
  proposals: [{ id: "proposal-test", proposedBy: "character", proposedAt: 1, startAt, timePrecision: "exact", activity: "喝咖啡", traveler: "both", status: "active", sourceMessageIds: [] }],
  currentProposalId: "proposal-test",
  sourceMessageIds: [],
  confirmedAt: 2,
  createdAt: 1,
  updatedAt: 2,
};

assert.equal(getAppointmentReminder(appointment, startAt - 16 * 60 * 1000), undefined);
assert.equal(getAppointmentReminder(appointment, startAt - 5 * 60 * 1000)?.kind, "upcoming");
assert.equal(getAppointmentReminder(appointment, startAt)?.kind, "due");
assert.equal(getAppointmentReminder(appointment, startAt + 2 * 60 * 60 * 1000 + 1), undefined, "stale appointments do not alert after a long-closed window");
const reminder = getAppointmentReminder(appointment, startAt - 5 * 60 * 1000);
assert.ok(reminder);
assert.equal(claimAppointmentReminder(reminder), true);
assert.equal(claimAppointmentReminder(reminder), false);
assert.equal(getAppointmentReminder({ ...appointment, status: "declined" }, startAt)?.kind, undefined);

console.log("PASS appointment reminder lead-time, due-time, and idempotent claim");
