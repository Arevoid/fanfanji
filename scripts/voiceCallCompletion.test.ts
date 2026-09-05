import assert from "node:assert/strict";
import { completeVoiceCall } from "../src/features/chat/services/voiceCallCompletion";

const base = {
  transcript: [{ id: "t1", sender: "user" as const, content: "你好", timestamp: 1 }],
  durationSeconds: 125,
  id: "call-1",
  characterId: "c1",
  scope: { relationId: "r1", conversationId: "r1-c1" },
  sender: "character" as const,
  timestamp: 100,
  incoming: true,
  recentMessages: [],
};
const completed = completeVoiceCall({ ...base, requestedStatus: "completed" });
assert.equal(completed.status, "completed");
assert.match(completed.callRecord.content, /02:05/);
assert.match(completed.callRecord.content, /%E4%BD%A0%E5%A5%BD/);
const empty = completeVoiceCall({ ...base, transcript: [], requestedStatus: "completed" });
assert.equal(empty.status, "cancelled");
assert.equal(Boolean(empty.rejectionPatch), true);
console.log("PASS voice call completion preserves transcript normalization, duration, cancellation, and rejection policy");
