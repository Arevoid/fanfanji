import assert from "node:assert/strict";
import {
  DIRECT_REPLY_RUNTIME_LIFECYCLE_GLOBAL,
  createDirectReplyRuntimeLifecycleRecorder,
} from "../src/features/chat/services/directReplyRuntimeLifecycleObserver";

assert.equal(typeof DIRECT_REPLY_RUNTIME_LIFECYCLE_GLOBAL, "string");
const recorder = createDirectReplyRuntimeLifecycleRecorder({ enabled: true, now: () => 1234, maxEvents: 2 });
recorder.record("initial_parse_success");
recorder.record("candidate_created", { candidateCount: 2 });
recorder.record("delivery_success", { deliveredCount: 2 });
assert.deepEqual(recorder.api.read().map((event) => event.stage), ["candidate_created", "delivery_success"]);
assert.deepEqual(recorder.api.read()[0], { stage: "candidate_created", sequence: 2, recordedAt: 1234, candidateCount: 2 });
assert.deepEqual(recorder.api.read()[1], { stage: "delivery_success", sequence: 3, recordedAt: 1234, deliveredCount: 2 });
recorder.api.clear();
assert.deepEqual(recorder.api.read(), []);
const disabled = createDirectReplyRuntimeLifecycleRecorder({ enabled: false });
disabled.record("terminal_response_format");
assert.deepEqual(disabled.api.read(), []);
console.log("Direct reply runtime lifecycle observer: bounded metadata-only recorder contract passed");
