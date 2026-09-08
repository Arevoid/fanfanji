import assert from "node:assert/strict";
import { formatWeChatTimestamp, getScheduledContactTime } from "../src/features/chat/services/chatTime";

const timestamp = 1_000;
const scheduled = getScheduledContactTime([
  { id: "ignored", timestamp: 500, content: "半小时后联系", isNarration: true },
  { id: "message", timestamp, content: "半小时后联系我" },
], "user");

assert.equal(scheduled?.msgId, "message");
assert.equal(scheduled?.durationMinutes, 30);
assert.equal(scheduled?.triggerTime, timestamp + 30 * 60 * 1_000);
assert.match(formatWeChatTimestamp(Date.now()), /^\d{2}:\d{2}$/);

console.log("PASS chat time helpers preserve scheduled-contact and timestamp behavior");
