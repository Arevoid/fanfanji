import assert from "node:assert/strict";
import type { InnerVoiceRecord } from "../src/types";
import { persistInlineInnerVoiceBestEffort } from "../src/features/chat/services/inlineInnerVoicePersistence";

const record: InnerVoiceRecord = {
  id: "voice-1", characterId: "character-1", relationId: "relation-1",
  conversationId: "direct:relation-1", messageId: "message-1", triggerMessageSummary: "hello",
  state: "calm", content: "A private thought.", createdAt: 1,
};

const failureNotices: string[] = [];
const failed = await persistInlineInnerVoiceBestEffort(
  record,
  (error) => failureNotices.push(error),
  async () => ({ success: false, error: "quota" }),
);
assert.equal(failed, false);
assert.deepEqual(failureNotices, ["quota"]);

let replyDelivered = false;
await persistInlineInnerVoiceBestEffort(record, undefined, async () => {
  throw new Error("IndexedDB unavailable");
}).then(() => { replyDelivered = true; });
assert.equal(replyDelivered, true, "a failed sidecar write resolves normally so reply delivery can continue");

const saved = await persistInlineInnerVoiceBestEffort(record, undefined, async () => ({ success: true }));
assert.equal(saved, true);
console.log("PASS inner voice persistence failures never throw into chat delivery");
