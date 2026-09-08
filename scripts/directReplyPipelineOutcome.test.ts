import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const start = source.indexOf("const executeDirectReplyPipeline");
const end = source.indexOf("const chatReplyController", start);
assert.ok(start >= 0 && end > start, "AppChat must retain one direct reply pipeline boundary");
const pipeline = source.slice(start, end);

assert.match(pipeline, /\): Promise<DirectReplyLifecycleOutcome> => \{/);
assert.match(pipeline, /createDirectReplyLifecycleOutcome\(/);
assert.match(pipeline, /postReplyCoordinator\.schedule\(/);
for (const phase of ["prepared", "requesting", "parsed", "delivering", "post_reply_scheduled", "failed", "cancelled"]) {
  assert.match(pipeline, new RegExp(`["']${phase}["']`), `pipeline must model ${phase} phase`);
}
assert.match(pipeline, /buildOutcome\([^\n]*"delivered"/);
assert.match(pipeline, /return buildOutcome\("failed"/);
assert.match(pipeline, /const failurePhase: DirectReplyLifecyclePhase/);
assert.match(pipeline, /return buildOutcome\("cancelled", "cancelled"/);
assert.doesNotMatch(pipeline, /generateRegeneratedChatTurn/);

console.log("Direct reply pipeline outcome: terminal phases and regenerate isolation are guarded");
