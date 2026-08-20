import assert from "node:assert/strict";
import {
  loadScheduleStore,
  listAppointmentsByScope,
  removeAppointmentsByRelations,
  saveScheduleStore,
  upsertAppointment,
} from "../src/core/storage/repositories/scheduleRepository";
import {
  appendAppointmentProposal,
  normalizeAppointment,
  transitionAppointment,
} from "../src/domain/schedule/appointmentPolicy";
import { projectAppointmentToScheduleEntry } from "../src/domain/schedule/scheduleProjection";
import { SCHEDULE_SCHEMA_VERSION, type Appointment, type ScheduleStore } from "../src/domain/schedule/scheduleTypes";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });

const startAt = new Date(2026, 7, 15, 15, 0).getTime();
const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: "appointment-a",
  schemaVersion: SCHEDULE_SCHEMA_VERSION,
  relationId: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  title: "与角色A见面",
  initiator: "character",
  mode: "scheduled",
  status: "awaiting_user",
  proposals: [{
    id: "proposal-a",
    proposedBy: "character",
    proposedAt: 10,
    startAt,
    timePrecision: "morning",
    activity: "一起吃饭",
    location: "用户所在城市",
    traveler: "character",
    transport: "乘车",
    status: "active",
    sourceMessageIds: ["message-a"],
  }],
  currentProposalId: "proposal-a",
  sourceMessageIds: ["message-a"],
  createdAt: 10,
  updatedAt: 10,
  ...overrides,
});

assert.ok(normalizeAppointment(appointment()));
assert.equal(normalizeAppointment(appointment({ relationId: "" })), undefined, "scope is mandatory");
assert.equal(projectAppointmentToScheduleEntry(appointment()), undefined, "pending invitation is not a calendar fact");

const counterProposal = appendAppointmentProposal(appointment(), {
  ...appointment().proposals[0],
  id: "proposal-sunday",
  proposedBy: "user",
  startAt: new Date(2026, 7, 16, 9, 0).getTime(),
  sourceMessageIds: ["message-counter"],
}, 15);
assert.equal(counterProposal.success, true);
if (!counterProposal.success) throw new Error("expected counter proposal");
assert.equal(counterProposal.appointment.status, "negotiating");
assert.equal(counterProposal.appointment.currentProposalId, "proposal-sunday");
assert.equal(counterProposal.appointment.proposals[0].status, "superseded", "old Saturday proposal is no longer live");
assert.equal(counterProposal.appointment.proposals[1].status, "active");
assert.deepEqual(counterProposal.appointment.sourceMessageIds, ["message-a", "message-counter"]);

const confirmed = transitionAppointment(appointment(), "confirmed", 20);
assert.equal(confirmed.success, true);
assert.equal(confirmed.appointment.confirmedAt, 20);
const projected = projectAppointmentToScheduleEntry(confirmed.appointment);
assert.equal(projected?.appointmentId, "appointment-a");
assert.equal(projected?.dateKey, "2026-08-15");
assert.equal(projected?.relationId, "relation-a");

const incomplete = appointment({
  proposals: [{ ...appointment().proposals[0], startAt: undefined, timePrecision: "undetermined" }],
});
assert.equal(transitionAppointment(incomplete, "confirmed").reason, "confirmation_incomplete");
assert.equal(transitionAppointment(appointment({ status: "draft" }), "confirmed").reason, "invalid_transition");
assert.equal(transitionAppointment(confirmed.appointment, "completed").reason, "invalid_transition", "states cannot skip lifecycle stages");
assert.equal(appendAppointmentProposal(confirmed.appointment, appointment().proposals[0]).success, false, "confirmed facts cannot be silently renegotiated");

const store: ScheduleStore = { schemaVersion: SCHEDULE_SCHEMA_VERSION, appointments: [confirmed.appointment] };
const otherScope = appointment({ id: "appointment-b", relationId: "relation-b", characterId: "character-b", userIdentityId: "identity-b" });
const withOther = upsertAppointment(store, otherScope);
assert.equal(withOther.success, true);
if (!withOther.success) throw new Error("expected appointment insert");
assert.deepEqual(listAppointmentsByScope({ relationId: "relation-a", characterId: "character-a", userIdentityId: "identity-a" }, withOther.store).map((item) => item.id), ["appointment-a"]);
assert.deepEqual(listAppointmentsByScope({ relationId: "relation-b", characterId: "character-b", userIdentityId: "identity-b" }, withOther.store).map((item) => item.id), ["appointment-b"]);

const conflictingOverwrite = upsertAppointment(store, appointment({ relationId: "relation-b" }));
assert.equal(conflictingOverwrite.success, false);
if (conflictingOverwrite.success) throw new Error("expected scope conflict");
assert.equal(conflictingOverwrite.reason, "scope_conflict");

assert.equal(saveScheduleStore(withOther.store).success, true);
assert.deepEqual(loadScheduleStore().value, withOther.store);
assert.deepEqual(removeAppointmentsByRelations(["relation-a"], withOther.store).appointments.map((item) => item.id), ["appointment-b"]);

values.set("phone_schedule_v1", JSON.stringify({ schemaVersion: 1, entries: [] }));
assert.deepEqual(loadScheduleStore().value.appointments, [], "empty first-round foundation remains readable");

console.log("PASS appointment state machine, projection truth boundary, scope isolation, and repository policy");
