import assert from "node:assert/strict";
import type { ForumReply, ForumThread } from "../src/types";
import { appendForumNotification, createForumNotification } from "../src/domain/forum/forumProfileData";

const thread: ForumThread = { id: "thread", ownerIdentityId: "identity", publicAuthor: { displayName: "用户", kind: "user", isAnonymous: false }, title: "标题", body: "正文", source: "user", occurredAt: 1, baseLikeCount: 0, likedByIdentityIds: [], replyCount: 0, createdAt: 1, updatedAt: 1 };
const aiReply: ForumReply = { id: "reply", threadId: thread.id, ownerIdentityId: "identity", floor: 2, publicAuthor: { displayName: "角色", kind: "ai-character", isAnonymous: false }, body: "收到", source: "ai-character", occurredAt: 2, baseLikeCount: 0, likedByIdentityIds: [], createdAt: 2, updatedAt: 2 };
const notice = createForumNotification({ ownerIdentityId: "identity", thread, reply: aiReply });
assert.ok(notice); assert.equal(notice?.type, "thread-reply"); assert.equal("privateActor" in (notice as object), false);
const userReply = { ...aiReply, id: "user-reply", source: "user" as const };
assert.equal(createForumNotification({ ownerIdentityId: "identity", thread, reply: userReply }), null);
assert.equal(appendForumNotification([notice!], notice!).length, 1);
console.log("forum notification tests passed");
