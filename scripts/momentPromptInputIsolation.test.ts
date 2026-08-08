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
  "Recent real-time conversation",
  "Long-term archived summaries",
  "Historical fallback",
  "Complete active world book",
  "User Profile (Machine Owner",
  "Below is your recent direct chat history",
]) {
  assert.equal(
    momentAutomation.includes(forbidden),
    false,
    `Moment automation must not inject private input: ${forbidden}`,
  );
}
assert.match(momentAutomation, /buildRelationMomentContext/, "Moment automation should use its relation-scoped cognitive projection");
assert.match(appChat, /listCharacterEventsByRelation\(relationship\.id\)/, "Moment events must be read through the current relationship only");
assert.match(appChat, /buildMomentWorldKnowledge/, "Moment WorldBook context must be scoped before prompt injection");
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
    "buildMomentPromptContext",
    "formatMomentPromptContext",
  ]) {
    assert.equal(source.includes(forbidden), false, `${service} must not construct an unscoped cognitive prompt: ${forbidden}`);
  }
  assert.match(source, /relationContext/, `${service} should accept only an explicit relation-scoped projection`);
  assert.match(source, /relationWorldKnowledge/, `${service} should accept only pre-scoped WorldBook entries`);
}

console.log("PASS Moment prompt input isolation excludes raw chat history and accepts only explicit relation-scoped projections");
