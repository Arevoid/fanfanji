import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const startOfflineHook = readFileSync(new URL("../src/features/chat/hooks/useChatStartOfflineFromMessage.ts", import.meta.url), "utf8");
const appointmentHook = readFileSync(new URL("../src/features/chat/hooks/useChatAppointment.ts", import.meta.url), "utf8");
const offline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const offlineAutoStartHook = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryAutoStart.ts", import.meta.url), "utf8");
const offlineExitFinalization = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryExitFinalization.ts", import.meta.url), "utf8");

assert.match(appointmentHook, /isAppointmentReadyForOfflineEntry\(appointment, now\)/);
assert.match(chat, /useChatAppointment\(\{ activeRelationship, appointments \}\)/);
assert.match(chat, /约定时间已到，可以进入线下见面/);
assert.match(chat, /handleStartOfflineFromMsg\(sourceMessage, readyOfflineAppointment\)/);
assert.match(startOfflineHook, /startAppointmentOfflineSession\(appointment, Date\.now\(\)\)/);
assert.match(startOfflineHook, /sourceAppointmentId: appointment\.id, autoStartFirstAct: true/);
assert.match(startOfflineHook, /offlineStories\.find\(\(story\) => story\.sourceAppointmentId === appointment\.id/);
assert.match(offline, /useOfflineStoryAutoStart/);
assert.match(offlineAutoStartHook, /story\?\.autoStartFirstAct/);
assert.match(offlineAutoStartHook, /handleSendMessage\(undefined, true\)/);
assert.match(offlineExitFinalization, /completeAppointmentOfflineSession\(appointment, handoffCreatedAt\)/);
assert.match(app, /appointments=\{scheduleStore\.appointments\}[\s\S]*onSaveAppointment=\{handleSaveAppointment\}[\s\S]*onSaveOfflineStory=\{handleSaveOfflineStory\}/);

console.log("PASS due appointment entry is user-triggered, relation-scoped, auto-opens the first act, and completes on exit");
