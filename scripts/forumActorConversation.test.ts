import assert from "node:assert/strict";
import { parseForumGeneratedEventBatch } from "../src/domain/forum/forumValidation";
import { planForumActivity, releaseForumPendingEvents } from "../src/features/forum/services/forumActivityService";
import type { ForumThread, UserSettings } from "../src/types";

const settings = { apiKey: "test", selectedModel: "model", identities: [{ id: "identity-a", name: "User", signature: "", bio: "" }] } as UserSettings;
const thread: ForumThread = {
  id: "thread-a", ownerIdentityId: "identity-a", publicAuthor: { displayName: "虚拟楼主", kind: "virtual", isAnonymous: false },
  title: "如何整理旧物", body: "想听听大家处理旧物的办法。", source: "ai-virtual", occurredAt: 1,
  baseLikeCount: 0, likedByIdentityIds: [], replyCount: 0, createdAt: 1, updatedAt: 1,
};

const parsed = parseForumGeneratedEventBatch(JSON.stringify({ events: [
  { localId: "e1", actorSlot: "virtual-1", kind: "reply", body: "旧物整理时我会先按使用频率分类，再决定是否保留。", replyTo: { type: "thread" }, delaySeconds: 0 },
  { localId: "e2", actorSlot: "virtual-2", kind: "reply", body: "这个旧物整理办法挺实用，我也会先拍照留档。", replyTo: { type: "batch", localId: "e1" }, delaySeconds: 30 },
] }));
assert.equal(parsed.events.length, 2);

const events = await planForumActivity({
  trigger: "automatic", ownerIdentityId: "identity-a", thread, replies: [], actorStates: [], relationships: [], characters: [], messages: [], memories: [], worldBookEntries: [], settings, now: 100,
  aiCall: async () => ({ text: JSON.stringify({ events: [
    { localId: "e1", actorSlot: "virtual-1", kind: "reply", body: "旧物整理时我会先按使用频率分类，再决定是否保留。", replyTo: { type: "thread" }, delaySeconds: 0 },
    { localId: "e2", actorSlot: "virtual-2", kind: "reply", body: "这个旧物整理办法挺实用，我也会先拍照留档。", replyTo: { type: "batch", localId: "e1" }, delaySeconds: 30 },
  ] }) }),
});
assert.equal(events.length, 2, "one call plans a bounded multi-actor batch");
assert.equal(events[0].privateActor?.kind, "virtual");
assert.equal(events[1].replyTarget.type, "batch");

const interactionEvents = await planForumActivity({
  trigger: "user-interaction", ownerIdentityId: "identity-a", thread,
  replies: [{
    id: "user-floor", threadId: thread.id, ownerIdentityId: thread.ownerIdentityId, floor: 2,
    publicAuthor: { displayName: "User", kind: "user", isAnonymous: false }, body: "杩欐槸鐢ㄦ埛鐨勫洖澶?", source: "user",
    occurredAt: 2, baseLikeCount: 0, likedByIdentityIds: [], createdAt: 2, updatedAt: 2,
  }],
  actorStates: [], relationships: [], characters: [], messages: [], memories: [], worldBookEntries: [], settings, now: 200,
  requiredReplyFloor: 2,
  ignoreActorCooldown: true,
  aiCall: async () => ({ text: JSON.stringify({ events: [
    { localId: "interaction", actorSlot: "virtual-1", kind: "reply", body: thread.title, replyTo: { type: "thread" }, delaySeconds: 0 },
  ] }) }),
});
assert.equal(interactionEvents.length, 1, "a user interaction always produces a bounded response event");
assert.deepEqual(interactionEvents[0].replyTarget, { type: "floor", floor: 2 }, "the response is anchored to the user's reply floor");

const first = releaseForumPendingEvents({ events, threads: [thread], replies: [], actorStates: [], ownerIdentityId: "identity-a", now: 100, limit: 1 });
assert.equal(first.replies.length, 1, "pending events release one at a time");
assert.equal(first.events[0].status, "released");
const second = releaseForumPendingEvents({ events: first.events, threads: [thread], replies: first.replies, actorStates: first.actorStates, ownerIdentityId: "identity-a", now: 30_100, limit: 1 });
assert.equal(second.replies.length, 2);
assert.equal(second.replies[1].replyToFloor, second.replies[0].floor, "batch reference resolves to the released floor");

const invalid = await planForumActivity({
  trigger: "automatic", ownerIdentityId: "identity-a", thread, replies: [], actorStates: [], relationships: [], characters: [], messages: [], memories: [], worldBookEntries: [], settings, now: 100,
  aiCall: async () => ({ text: JSON.stringify({ events: [{ localId: "bad", actorSlot: "relation-secret", kind: "reply", body: "无效作者", replyTo: { type: "thread" } }] }) }),
});
assert.equal(invalid.length, 0, "unknown actor slots cannot create replies");
console.log("PASS forum actor batch validation, sequential release, references, and private actor isolation");
