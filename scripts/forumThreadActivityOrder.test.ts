import assert from "node:assert/strict";
import {
  listForumThreadsForIdentity,
  selectForumThreadMetrics,
} from "../src/domain/forum/forumData";
import type { ForumReply, ForumThread } from "../src/types";

const makeThread = (id: string, createdAt: number): ForumThread => ({
  id,
  ownerIdentityId: "identity-1",
  publicAuthor: { displayName: "用户", kind: "user", isAnonymous: false },
  title: id,
  body: `${id} 正文`,
  source: "user",
  occurredAt: createdAt,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  replyCount: 0,
  createdAt,
  updatedAt: createdAt,
  lastActivityAt: createdAt,
});

const oldThread = makeThread("old-thread", 100);
const newThread = makeThread("new-thread", 200);
const reply: ForumReply = {
  id: "reply-1",
  threadId: oldThread.id,
  ownerIdentityId: oldThread.ownerIdentityId,
  floor: 2,
  kind: "reply",
  publicAuthor: { displayName: "回复者", kind: "virtual", isAnonymous: true },
  body: "新的回复",
  source: "ai-virtual",
  occurredAt: 300,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  createdAt: 300,
  updatedAt: 300,
};

assert.deepEqual(
  listForumThreadsForIdentity([oldThread, newThread], oldThread.ownerIdentityId, [reply]).map((thread) => thread.id),
  [oldThread.id, newThread.id],
);
const metrics = selectForumThreadMetrics(oldThread, [reply]);
assert.equal(metrics.updatedAt, reply.occurredAt);
assert.equal(metrics.effectiveReplyCount, 1);

const deletedReply = { ...reply, isDeleted: true, occurredAt: 400 };
assert.deepEqual(
  listForumThreadsForIdentity([oldThread, newThread], oldThread.ownerIdentityId, [deletedReply]).map((thread) => thread.id),
  [newThread.id, oldThread.id],
);

console.log("PASS live replies move threads to the top while deleted replies do not");
