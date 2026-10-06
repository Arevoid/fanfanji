import assert from "node:assert/strict";
import { resolveSmsConversationActivity } from "../src/features/sms/smsInbox";
import type { SmsMessage, SmsTimeline } from "../src/domain/sms/smsTypes";

const timeline = (id: string, updatedAt: number): SmsTimeline => ({
  id,
  characterId: `character-${id}`,
  ownerIdentityId: "identity-a",
  phoneNumber: "1380000000000",
  label: "未锚定探索",
  kind: "custom",
  mode: "unanchored",
  knowsCurrentTimeline: false,
  createdAt: updatedAt,
  updatedAt,
});

const message = (id: string, timelineId: string, receivedAt: number, sender: SmsMessage["sender"] = "character"): SmsMessage => ({
  id,
  timelineId,
  characterId: `character-${timelineId}`,
  ownerIdentityId: "identity-a",
  phoneNumber: "1380000000000",
  sender,
  content: id,
  receivedAt,
});

const emptyConversation = resolveSmsConversationActivity([], []);
assert.equal(emptyConversation.lastActivityAt, 0, "an empty conversation must not receive Date.now() activity");
assert.equal(emptyConversation.latestMessage, undefined);

const oldTimeline = timeline("old", 100);
const newerEmptyTimeline = timeline("new", 200);
const oldMessage = message("old-message", oldTimeline.id, 150);
const activity = resolveSmsConversationActivity([oldTimeline, newerEmptyTimeline], [oldMessage]);
assert.equal(activity.latestMessage?.id, "old-message", "latest message must be found across all timelines");
assert.equal(activity.lastActivityAt, 150, "a real message must outrank an empty newer timeline");
assert.equal(activity.unreadCount, 1);

const readActivity = resolveSmsConversationActivity([oldTimeline], [{ ...oldMessage, readAt: 160 }]);
assert.equal(readActivity.unreadCount, 0);
assert.equal(readActivity.lastActivityAt, 150);

console.log("PASS SMS inbox activity uses all timelines and never timestamps empty previews");
