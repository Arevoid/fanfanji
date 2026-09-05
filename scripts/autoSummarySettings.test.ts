import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const appMemory = readFileSync(new URL("../src/components/AppMemory.tsx", import.meta.url), "utf8");
const sideEffects = readFileSync(new URL("../src/features/chat/controllers/chatSideEffectController.ts", import.meta.url), "utf8");

assert.doesNotMatch(appChat, /对话后台自动归档/);
assert.doesNotMatch(appMemory, /开启自动总结开关/);
assert.doesNotMatch(appMemory, /type="checkbox"/);
assert.match(appMemory, /enableAutoSummary: true/);
assert.match(appMemory, /DEFAULT_AUTO_SUMMARY_ROUNDS = 50/);
assert.match(appMemory, /min="10"/);
assert.match(appMemory, /max="100"/);
assert.match(appMemory, /step="10"/);
assert.doesNotMatch(sideEffects, /enableAutoSummary !== false/);
assert.match(sideEffects, /const configuredRounds = input\.activeCharacter\.summaryTriggerRound/);
assert.match(sideEffects, /: 50;/);

console.log("Automatic summary settings: 7 acceptance checks passed");
