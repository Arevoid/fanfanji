import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectForumThreadMetrics } from "../src/domain/forum/forumData";
import { recordForumVisit } from "../src/domain/forum/forumProfileData";
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
assert.equal(selectForumThreadMetrics(thread, [authorUpdate]).hasUnreadAuthorUpdate, true);
assert.equal(selectForumThreadMetrics(thread, [authorUpdate], 199).hasUnreadAuthorUpdate, true);
assert.equal(selectForumThreadMetrics(thread, [authorUpdate], 200).hasUnreadAuthorUpdate, false);
assert.equal(selectForumThreadMetrics(thread, [authorUpdate], 201).hasUnreadAuthorUpdate, false);
const visitsAfterOpeningThread = recordForumVisit([], "identity-1", thread, [authorUpdate]);
assert.equal(
  selectForumThreadMetrics(thread, [authorUpdate], visitsAfterOpeningThread[0]?.lastVisitedAt).hasUnreadAuthorUpdate,
  false,
  "opening a thread records a visit that clears its current author-update badge",
);
assert.equal(selectForumThreadMetrics(thread, [{ ...authorUpdate, isDeleted: true }]).hasAuthorUpdate, false);
assert.equal(selectForumThreadMetrics(thread, [{ ...authorUpdate, isDeleted: true }]).hasUnreadAuthorUpdate, false);

const card = readFileSync(new URL("../src/features/forum/components/ForumThreadCard.tsx", import.meta.url), "utf8");
const appForum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
assert.match(card, /metrics\.hasUnreadAuthorUpdate/);
assert.match(card, /楼主更新/);
assert.match(card, /aria-pressed=\{liked\}/);
assert.match(appForum, /visitHistory\.find\(\(visit\) => visit\.threadId === thread\.id\)\?\.lastVisitedAt/);

console.log("PASS forum cards expose the author-update badge and preserve live/deleted state");
