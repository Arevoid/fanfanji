import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(chat, /status === "awaiting_user" \|\| appointment\.status === "negotiating"/);
assert.match(chat, /buildProactiveOfflineResponsePrompt/);
assert.match(chat, /parseProactiveOfflineResponseDirective/);
assert.match(chat, /applyProactiveOfflineResponse/);
assert.match(chat, /userMessageId: userMsg\.id/);
assert.match(chat, /onSaveAppointment\?\.\(updatedAppointment\)/);
assert.doesNotMatch(chat, /onSaveOfflineStory\?\.\([^)]*updatedAppointment/);

console.log("PASS direct chat wires pending appointment negotiation to durable schedule state without starting offline story");
