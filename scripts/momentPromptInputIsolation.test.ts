import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appChat = readFileSync(resolve(root, "src/components/AppChat.tsx"), "utf8");
const momentStart = appChat.indexOf("const handleAutoCommentOnUserMoment");
const momentEnd = appChat.indexOf("// Moments publication", momentStart);
assert.notEqual(momentStart, -1, "Moment automation section should exist");
assert.notEqual(momentEnd, -1, "Moment automation section should have a stable boundary");
const momentAutomation = appChat.slice(momentStart, momentEnd);

for (const forbidden of [
  "getMomentCognitiveContext",
  "buildMomentCognitiveContext",
  "Recent real-time conversation",
  "Long-term archived summaries",
  "Historical fallback",
  "Complete active world book",
  "User Profile (Machine Owner",
  "Below is your recent direct chat history",
  "cognitiveContext",
]) {
  assert.equal(
    momentAutomation.includes(forbidden),
    false,
    `Moment automation must not inject private input: ${forbidden}`,
  );
}
assert.ok(
  (momentAutomation.match(/history: \[\]/g) || []).length >= 3,
  "post, comment, and reply PromptComposer calls should provide no private chat history",
);

for (const service of [
  "src/features/moments/services/momentGenerator.ts",
  "src/features/moments/services/momentCommentService.ts",
  "src/features/moments/services/momentReplyService.ts",
]) {
  const source = readFileSync(resolve(root, service), "utf8");
  for (const forbidden of [
    "CharacterCognitiveContext",
    "buildMomentPromptContext",
    "formatMomentPromptContext",
    "cognitiveContext",
  ]) {
    assert.equal(source.includes(forbidden), false, `${service} must not accept private cognitive input: ${forbidden}`);
  }
}

console.log("PASS Moment prompt input isolation excludes private chat, memory, relationship, and private cognitive context");
