import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectForumThreadMetrics } from "../src/domain/forum/forumData";
import type { ForumReply, ForumThread } from "../src/types";

const thread: ForumThread = {
  id: "thread-author-update",
  ownerIdentityId: "identity-1",
  publicAuthor: { displayName: "楼主", kind: "virtual", isAnonymous: false },
  title: "有更新的帖子",
  body: "原始正文",
  source: "ai-virtual",
  occurredAt: 100,
  baseLikeCount: 3,
  likedByIdentityIds: [],
  replyCount: 1,
  createdAt: 100,
  updatedAt: 200,
  lastActivityAt: 200,
};
const authorUpdate: ForumReply = {
  id: "author-update-1",
  threadId: thread.id,
  ownerIdentityId: thread.ownerIdentityId,
  floor: 2,
  kind: "author-update",
  publicAuthor: thread.publicAuthor,
  body: "楼主补充了一条新信息",
  source: "ai-virtual",
  occurredAt: 200,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  createdAt: 200,
  updatedAt: 200,
};
assert.equal(selectForumThreadMetrics(thread, [authorUpdate]).hasAuthorUpdate, true);
assert.equal(selectForumThreadMetrics(thread, [{ ...authorUpdate, isDeleted: true }]).hasAuthorUpdate, false);

const card = readFileSync(new URL("../src/features/forum/components/ForumThreadCard.tsx", import.meta.url), "utf8");
assert.match(card, /metrics\.hasAuthorUpdate/);
assert.match(card, /楼主更新/);
assert.match(card, /aria-pressed=\{liked\}/);

console.log("PASS forum cards expose the author-update badge and preserve live/deleted state");
