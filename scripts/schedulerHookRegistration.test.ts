import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/core/scheduler/useBackgroundScheduler.ts", import.meta.url), "utf8");
const proactiveChat = readFileSync(new URL("../src/features/chat/hooks/useProactiveChatScheduler.ts", import.meta.url), "utf8");
const proactiveCall = readFileSync(new URL("../src/features/chat/hooks/useProactiveCallScheduler.ts", import.meta.url), "utf8");
const forum = readFileSync(new URL("../src/features/forum/hooks/useForumActivityEngine.ts", import.meta.url), "utf8");
assert.match(hook, /registerBackgroundTaskFactory/);
assert.match(hook, /resumeFrom: snapshot/);
assert.match(hook, /updateDescriptor\(\{ reason, cooldownUntil, userRejected, metadata, recoveryPayload \}\)/);
assert.match(hook, /\}, \[enabled, id, intervalMs, initialDelayMs, taskType, pauseWhenHidden, pauseWhenOffline\]\)/);
assert.match(proactiveChat, /recoveryPayload/);
assert.match(proactiveCall, /recoveryPayload/);
assert.match(forum, /recoveryPayload/);
console.log("PASS production scheduler hooks register recoverable task definitions with safe descriptors");
