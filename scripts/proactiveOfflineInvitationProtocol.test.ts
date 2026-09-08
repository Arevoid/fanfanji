import assert from "node:assert/strict";
import { normalizeAppointment } from "../src/domain/schedule/appointmentPolicy";
import { createProactiveAppointment } from "../src/domain/schedule/proactiveAppointmentFactory";
import { buildProactiveOfflineInvitationPrompt } from "../src/features/chat/prompts/proactiveOfflineInvitationPrompt";
import { parseProactiveOfflineInvitationDirective } from "../src/features/chat/services/proactiveOfflineInvitationProtocol";

const now = new Date("2026-08-13T12:00:00+08:00").getTime();
const prompt = buildProactiveOfflineInvitationPrompt({ allowedModes: ["scheduled"], now, timeZone: "Asia/Shanghai" });
assert.match(prompt, /不是要求你必须邀请/);
assert.match(prompt, /不得声称用户已答应/);
assert.match(prompt, /本轮通过事实校验的邀请类型仅有：未来约定/);
assert.doesNotMatch(prompt, /本轮通过事实校验的邀请类型仅有：.*立即见面/);

const raw = `我周日上午坐车过去找你，要不要一起吃饭？\n[[OFFLINE_INVITATION]]\n{"mode":"scheduled","startAt":"2026-08-16T10:00:00+08:00","timePrecision":"morning","activity":"一起吃饭","location":"市中心","traveler":"character","transport":"坐车"}\n[[/OFFLINE_INVITATION]]`;
const parsed = parseProactiveOfflineInvitationDirective({ text: raw, allowedModes: ["scheduled"], now });
assert.equal(parsed.visibleText, "我周日上午坐车过去找你，要不要一起吃饭？");
assert.equal(parsed.directive?.mode, "scheduled");
assert.equal(parsed.directive?.startAt, new Date("2026-08-16T10:00:00+08:00").getTime());

const appointment = createProactiveAppointment({
  id: "appointment-a",
  proposalId: "proposal-a",
  scope: { relationId: "relation-a", characterId: "character-a", userIdentityId: "identity-a" },
  directive: parsed.directive!,
  sourceMessageId: "message-a",
  now,
});
assert.equal(appointment.status, "awaiting_user", "an invitation must not fabricate user acceptance");
assert.equal(appointment.confirmedAt, undefined);
assert.equal(appointment.proposals[0].proposedBy, "character");
assert.ok(normalizeAppointment(appointment));

const disallowed = parseProactiveOfflineInvitationDirective({ text: raw.replace('"scheduled"', '"immediate"'), allowedModes: ["scheduled"], now });
assert.equal(disallowed.directive, undefined);
assert.equal(disallowed.error, "invalid_directive");
assert.doesNotMatch(disallowed.visibleText, /OFFLINE_INVITATION/);

const past = parseProactiveOfflineInvitationDirective({ text: raw.replace("2026-08-16T10:00:00+08:00", "2026-08-12T10:00:00+08:00"), allowedModes: ["scheduled"], now });
assert.equal(past.error, "invalid_directive");

const malformed = parseProactiveOfflineInvitationDirective({ text: "正常聊天\n[[OFFLINE_INVITATION]]\n{bad json}\n[[/OFFLINE_INVITATION]]", allowedModes: ["scheduled"], now });
assert.deepEqual(malformed, { visibleText: "正常聊天", error: "malformed_json" });
const incomplete = parseProactiveOfflineInvitationDirective({ text: "正常聊天\n[[OFFLINE_INVITATION]]\n{bad", allowedModes: ["scheduled"], now });
assert.equal(incomplete.visibleText, "正常聊天");
assert.equal(incomplete.directive, undefined);
const duplicate = parseProactiveOfflineInvitationDirective({ text: `${raw}\n${raw}`, allowedModes: ["scheduled"], now });
assert.equal(duplicate.error, "multiple_directives");
assert.doesNotMatch(duplicate.visibleText, /OFFLINE_INVITATION/);
assert.throws(() => createProactiveAppointment({
  id: "",
  proposalId: "proposal",
  scope: { relationId: "relation-a", characterId: "character-a", userIdentityId: "identity-a" },
  directive: parsed.directive!,
  sourceMessageId: "message-a",
  now,
}));

console.log("PASS proactive offline prompt, hidden protocol validation, and pending appointment factory");
