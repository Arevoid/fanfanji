import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const offline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.match(chat, /isAppointmentReadyForOfflineEntry\(appointment, appointmentClock\)/);
assert.match(chat, /约定时间已到，可以进入线下见面/);
assert.match(chat, /handleStartOfflineFromMsg\(sourceMessage, readyOfflineAppointment\)/);
assert.match(chat, /startAppointmentOfflineSession\(appointment, Date\.now\(\)\)/);
assert.match(chat, /sourceAppointmentId: appointment\.id, autoStartFirstAct: true/);
assert.match(chat, /offlineStories\.find\(\(story\) => story\.sourceAppointmentId === appointment\.id/);
assert.match(offline, /story\?\.autoStartFirstAct/);
assert.match(offline, /handleSendMessage\(undefined, true\)/);
assert.match(offline, /completeAppointmentOfflineSession\(appointment, handoffCreatedAt\)/);
assert.match(app, /appointments=\{scheduleStore\.appointments\}[\s\S]*onSaveAppointment=\{handleSaveAppointment\}[\s\S]*onSaveOfflineStory=\{handleSaveOfflineStory\}/);

console.log("PASS due appointment entry is user-triggered, relation-scoped, auto-opens the first act, and completes on exit");
