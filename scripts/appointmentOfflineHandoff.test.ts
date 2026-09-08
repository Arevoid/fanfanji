import assert from "node:assert/strict";
import {
  completeAppointmentOfflineSession,
  isAppointmentReadyForOfflineEntry,
  startAppointmentOfflineSession,
} from "../src/domain/schedule/appointmentOfflineHandoff";
import { SCHEDULE_SCHEMA_VERSION, type Appointment } from "../src/domain/schedule/scheduleTypes";

const now = new Date("2026-08-16T10:00:00+08:00").getTime();
const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: "appointment-a",
  schemaVersion: SCHEDULE_SCHEMA_VERSION,
  relationId: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  title: "一起吃饭",
  initiator: "character",
  mode: "scheduled",
  status: "confirmed",
  proposals: [{
    id: "proposal-a",
    proposedBy: "character",
    proposedAt: now - 1_000,
    startAt: now,
    timePrecision: "exact",
    activity: "一起吃饭",
    traveler: "character",
    status: "active",
    sourceMessageIds: ["message-a"],
  }],
  currentProposalId: "proposal-a",
  sourceMessageIds: ["message-a"],
  confirmedAt: now - 500,
  createdAt: now - 1_000,
  updatedAt: now - 500,
  ...overrides,
});

assert.equal(isAppointmentReadyForOfflineEntry(appointment(), now - 1), false, "future meetings do not open early");
assert.equal(isAppointmentReadyForOfflineEntry(appointment(), now), true);
assert.equal(isAppointmentReadyForOfflineEntry(appointment({ mode: "immediate" }), now - 10_000), true);
const started = startAppointmentOfflineSession(appointment(), now);
assert.equal(started?.status, "in_progress");
assert.equal(startAppointmentOfflineSession({ ...appointment(), status: "ready" }, now)?.status, "in_progress");
assert.equal(startAppointmentOfflineSession(appointment({ status: "declined", confirmedAt: undefined }), now), undefined);
assert.equal(completeAppointmentOfflineSession(started!, now + 1)?.status, "completed");

console.log("PASS confirmed appointments open only when due and follow the explicit offline-session lifecycle");
