import assert from "node:assert/strict";
import { applyForumStoryUpdate, canScheduleStoryContinuation, inferForumStoryArc } from "../src/domain/forum/forumStoryArc";
import type { ForumReply, ForumThread } from "../src/types";

const now = 4 * 24 * 60 * 60 * 1000;
const arc = inferForumStoryArc({ source: "ai-virtual", title: "宿舍门外半夜一直有人敲门", body: "先记下来，明天再看。" });
assert.ok(arc && arc.status === "open");
const thread: ForumThread = { id: "story", ownerIdentityId: "i", publicAuthor: { displayName: "路人甲", kind: "virtual", isAnonymous: false }, title: "宿舍门外半夜一直有人敲门", body: "先记下来，明天再看。", source: "ai-virtual", occurredAt: now - 7 * 60 * 60 * 1000, baseLikeCount: 0, likedByIdentityIds: [], replyCount: 0, createdAt: now, updatedAt: now, storyArc: arc };
assert.equal(canScheduleStoryContinuation(thread, [], now), true);
const update: ForumReply = { id: "r", threadId: "story", ownerIdentityId: "i", floor: 2, kind: "author-update", publicAuthor: thread.publicAuthor, body: "我去问了管理员，门外的声音终于停了。", source: "ai-virtual", occurredAt: now, baseLikeCount: 0, likedByIdentityIds: [], createdAt: now, updatedAt: now };
const next = applyForumStoryUpdate(thread, update, now);
assert.equal(next.storyArc?.episode, 2); assert.equal(next.storyArc?.status, "open");
assert.equal(canScheduleStoryContinuation({ ...thread, source: "user" }, [], now), false, "AI never impersonates a user author update");
console.log("forum story continuation tests passed");
