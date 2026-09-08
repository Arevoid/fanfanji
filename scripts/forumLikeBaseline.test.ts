import assert from "node:assert/strict";
import {
  getForumBaselineLikeCount,
  getForumLikeCount,
  normalizeForumThreadEngagement,
  toggleForumThreadLike,
} from "../src/domain/forum/forumData";
import type { ForumThread } from "../src/types";

const makeThread = (overrides: Partial<ForumThread> = {}): ForumThread => ({
  id: "forum-generated-1",
  ownerIdentityId: "identity-1",
  publicAuthor: {
    displayName: "匿名用户",
    kind: "virtual",
    isAnonymous: true,
  },
  title: "测试帖子",
  body: "测试正文",
  source: "ai-virtual",
  occurredAt: 100,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  replyCount: 0,
  createdAt: 100,
  updatedAt: 100,
  ...overrides,
});

const generated = makeThread();
const normalizedOnce = normalizeForumThreadEngagement([generated], []).at(0);
const normalizedTwice = normalizeForumThreadEngagement([normalizedOnce!], []).at(0);

assert.ok(normalizedOnce);
assert.ok(normalizedOnce.baseLikeCount > 0);
assert.equal(normalizedOnce.baseLikeCount, getForumBaselineLikeCount(generated.id, generated.source));
assert.deepEqual(normalizedTwice, normalizedOnce);
assert.equal(getForumLikeCount(normalizedOnce), normalizedOnce.baseLikeCount);

const userThread = makeThread({
  id: "forum-user-1",
  source: "user",
  publicAuthor: { displayName: "我", kind: "user", isAnonymous: false },
});
assert.equal(normalizeForumThreadEngagement([userThread], [])[0].baseLikeCount, 0);

const liked = toggleForumThreadLike([normalizedOnce], normalizedOnce.id, normalizedOnce.ownerIdentityId, 999)[0];
assert.equal(liked.likedByIdentityIds.includes(normalizedOnce.ownerIdentityId), true);
assert.equal(getForumLikeCount(liked), normalizedOnce.baseLikeCount + 1);

const within = (value: number, minimum: number, maximum: number) =>
  assert.ok(value >= minimum && value <= maximum, `${value} should be within ${minimum}-${maximum}`);

within(getForumBaselineLikeCount("reply-band-0", "ai-virtual", 0), 0, 200);
within(getForumBaselineLikeCount("reply-band-5", "ai-virtual", 5), 0, 200);
within(getForumBaselineLikeCount("reply-band-6", "ai-virtual", 6), 200, 350);
within(getForumBaselineLikeCount("reply-band-10", "ai-virtual", 10), 200, 350);
within(getForumBaselineLikeCount("reply-band-20", "ai-virtual", 20), 350, 1000);
within(getForumBaselineLikeCount("reply-band-30", "ai-virtual", 30), 1000, 2000);
within(getForumBaselineLikeCount("reply-band-40", "ai-virtual", 40), 2000, 3000);
within(getForumBaselineLikeCount("reply-band-55", "ai-virtual", 55), 3000, 5000);

console.log("PASS forum generated posts use comment-aligned baseline likes and user likes remain additive");
