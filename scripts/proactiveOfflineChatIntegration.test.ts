import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateProactiveReplyCandidates } from "../src/features/chat/services/proactiveMessageService";
import type { AiChatRequest } from "../src/features/chat/services/chatServiceTypes";

const now = new Date("2026-08-13T12:00:00+08:00").getTime();
const request: AiChatRequest = { message: "proactive", history: [], systemInstruction: "persona", apiKey: "test", model: "test" };
const result = await generateProactiveReplyCandidates({
  requestAi: async () => ({ text: "周日上午我坐车过去，要不要一起吃饭？\n[[OFFLINE_INVITATION]]\n{\"mode\":\"scheduled\",\"startAt\":\"2026-08-16T10:00:00+08:00\",\"timePrecision\":\"morning\",\"activity\":\"一起吃饭\",\"location\":\"市中心\",\"traveler\":\"character\",\"transport\":\"坐车\"}\n[[/OFFLINE_INVITATION]]" }),
  request,
  characterId: "character-a",
  disableBracketActions: false,
  keepPeriods: false,
  createId: (index) => `message-${index}`,
  currentTime: (index) => now + index,
  proactiveOfflineAllowedModes: ["scheduled"],
  directiveNow: now,
});

assert.deepEqual(result.messages.map((message) => message.content), ["周日上午我坐车过去，要不要一起吃饭？"]);
assert.equal(result.proactiveOfflineDirective?.mode, "scheduled");
assert.equal(result.proactiveOfflineDirective?.traveler, "character");
assert.equal(result.messages.some((message) => message.content.includes("OFFLINE_INVITATION")), false);

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(app, /appointments=\{scheduleStore\.appointments\}/);
assert.match(app, /onSaveAppointment=\{handleSaveAppointment\}/);
assert.match(app, /saveScheduleStore\(result\.store\)/);
assert.match(chat, /evaluateProactiveOfflineEligibility/);
assert.match(chat, /deriveProactiveOfflineContextEvidence/);
assert.match(chat, /buildProactiveOfflineInvitationPrompt/);
assert.match(chat, /parseProactiveOfflineInvitationDirective/);
assert.match(chat, /persistProactiveOfflineInvitation/);
assert.match(chat, /activeAttachModal !== "calling"/);

console.log("PASS proactive offline invitation is wired through chat generation, hidden parsing, and durable schedule persistence");
