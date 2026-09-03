import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/chat/hooks/useChatAppointment.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(hook, /isAppointmentReadyForOfflineEntry/);
assert.match(hook, /setInterval/);
assert.match(app, /useChatAppointment\(\{ activeRelationship, appointments \}\)/);
assert.doesNotMatch(app, /setAppointmentClock/);
console.log("PASS chat appointment readiness is isolated in a dedicated hook");
