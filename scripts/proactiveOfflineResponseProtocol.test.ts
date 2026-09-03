import assert from "node:assert/strict";
import { projectAppointmentToScheduleEntry } from "../src/domain/schedule/scheduleProjection";
import { SCHEDULE_SCHEMA_VERSION, type Appointment } from "../src/domain/schedule/scheduleTypes";
import { buildProactiveOfflineResponsePrompt } from "../src/features/chat/prompts/proactiveOfflineResponsePrompt";
import {
  applyProactiveOfflineResponse,
  parseProactiveOfflineResponseDirective,
} from "../src/features/chat/services/proactiveOfflineResponseProtocol";

const now = new Date("2026-08-13T12:00:00+08:00").getTime();
const saturday = new Date("2026-08-15T15:00:00+08:00").getTime();
const sunday = new Date("2026-08-16T10:00:00+08:00").getTime();
const appointment: Appointment = {
  id: "appointment-a",
  schemaVersion: SCHEDULE_SCHEMA_VERSION,
  relationId: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  title: "一起吃饭",
  initiator: "character",
  mode: "scheduled",
  status: "awaiting_user",
  proposals: [{
    id: "proposal-a",
    proposedBy: "character",
    proposedAt: now - 1_000,
    startAt: saturday,
    timePrecision: "afternoon",
    activity: "一起吃饭",
    location: "市中心",
    traveler: "character",
    transport: "坐车",
    status: "active",
    sourceMessageIds: ["character-invite"],
  }],
  currentProposalId: "proposal-a",
  sourceMessageIds: ["character-invite"],
  createdAt: now - 1_000,
  updatedAt: now - 1_000,
};

const counterText = `好，那就改周日上午。\n[[OFFLINE_RESPONSE]]\n{"appointmentId":"appointment-a","action":"counter","startAt":"2026-08-16T10:00:00+08:00","timePrecision":"morning","activity":"一起吃饭","location":"市中心","traveler":"character","transport":"坐车","characterAccepts":true}\n[[/OFFLINE_RESPONSE]]`;
const counter = parseProactiveOfflineResponseDirective({
  text: counterText,
  appointment,
  latestUserText: "周六下午不方便，改为周日上午吧",
  now,
});
assert.equal(counter.visibleText, "好，那就改周日上午。");
assert.equal(counter.directive?.action, "counter");
assert.equal(counter.directive?.startAt, sunday);
const rescheduled = applyProactiveOfflineResponse({
  appointment,
  directive: counter.directive!,
  userMessageId: "user-counter",
  characterMessageId: "character-accept-counter",
  now,
});
assert.equal(rescheduled?.status, "confirmed", "character's explicit acceptance confirms the user's counter-proposal");
assert.equal(rescheduled?.proposals[0].status, "superseded");
assert.equal(rescheduled?.proposals[1].proposedBy, "user");
assert.equal(rescheduled?.proposals[1].startAt, sunday);
assert.equal(projectAppointmentToScheduleEntry(rescheduled!)?.dateKey, "2026-08-16");

const accepted = parseProactiveOfflineResponseDirective({
  text: `行，那周六见。\n[[OFFLINE_RESPONSE]]{"appointmentId":"appointment-a","action":"accept"}[[/OFFLINE_RESPONSE]]`,
  appointment,
  latestUserText: "好啊，没问题",
  now,
});
assert.equal(applyProactiveOfflineResponse({ appointment, directive: accepted.directive!, userMessageId: "user-accept", now })?.status, "confirmed");
const datedAcceptance = parseProactiveOfflineResponseDirective({
  text: `那就这么定。\n[[OFFLINE_RESPONSE]]{"appointmentId":"appointment-a","action":"accept"}[[/OFFLINE_RESPONSE]]`,
  appointment,
  latestUserText: "周六下午可以，没问题",
  now,
});
assert.equal(datedAcceptance.directive?.action, "accept", "mentioning the existing date while agreeing is not a counter-proposal");

const declined = parseProactiveOfflineResponseDirective({
  text: `知道了。\n[[OFFLINE_RESPONSE]]{"appointmentId":"appointment-a","action":"decline"}[[/OFFLINE_RESPONSE]]`,
  appointment,
  latestUserText: "周六下午不方便，别来了",
  now,
});
assert.equal(applyProactiveOfflineResponse({ appointment, directive: declined.directive!, userMessageId: "user-decline", now })?.status, "declined");

const fabricatedAcceptance = parseProactiveOfflineResponseDirective({
  text: `在听。\n[[OFFLINE_RESPONSE]]{"appointmentId":"appointment-a","action":"accept"}[[/OFFLINE_RESPONSE]]`,
  appointment,
  latestUserText: "我再想想",
  now,
});
assert.equal(fabricatedAcceptance.directive, undefined);
assert.equal(fabricatedAcceptance.error, "unsupported_by_user_message");
assert.equal(fabricatedAcceptance.visibleText, "在听。", "invalid internal state changes remain hidden");

const prompt = buildProactiveOfflineResponsePrompt({ appointment, now, timeZone: "Asia/Shanghai" });
assert.match(prompt, /不要替用户作决定/);
assert.match(prompt, /characterAccepts/);

console.log("PASS proactive offline responses handle acceptance, rejection, and user counter-proposals without fabricating consent");
