import assert from "node:assert/strict";
import type { ForumReply, ForumThread, UserIdentity } from "../src/types";
import { createForumProfile, recordForumVisit, updateForumLikeHistory } from "../src/domain/forum/forumProfileData";

const identity: UserIdentity = { id: "identity-a", name: "测试用户", avatar: "avatar.png", signature: "", bio: "" };
const thread: ForumThread = { id: "thread-a", ownerIdentityId: identity.id, publicAuthor: { displayName: "公开作者", kind: "virtual", isAnonymous: false }, title: "标题", body: "正文", source: "virtual", occurredAt: 1, baseLikeCount: 0, likedByIdentityIds: [], replyCount: 0, createdAt: 1, updatedAt: 1 };
const reply: ForumReply = { id: "reply-a", threadId: thread.id, ownerIdentityId: identity.id, floor: 2, publicAuthor: { displayName: "回复者", kind: "virtual", isAnonymous: false }, body: "回复", source: "ai-virtual", occurredAt: 2, baseLikeCount: 0, likedByIdentityIds: [], createdAt: 2, updatedAt: 2 };

const profile = createForumProfile(identity, 10);
assert.equal(profile.displayName, identity.name);
assert.equal(profile.avatar, identity.avatar);
const visits = recordForumVisit([], identity.id, thread, [reply], 20);
assert.equal(visits.length, 1); assert.equal(visits[0].publicSnapshot.threadId, thread.id);
assert.equal(recordForumVisit(visits, identity.id, thread, [reply], 30).length, 1);
let likes = updateForumLikeHistory([], { ownerIdentityId: identity.id, thread, replies: [reply], liked: true, now: 40 });
assert.equal(likes.length, 1); assert.equal(likes[0].publicSnapshot.thread.title, thread.title);
likes = updateForumLikeHistory(likes, { ownerIdentityId: identity.id, thread, replies: [reply], liked: false, now: 41 });
assert.equal(likes.length, 0);
console.log("forum profile/history tests passed");
