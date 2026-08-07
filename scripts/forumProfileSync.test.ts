import assert from "node:assert/strict";
import { createForumReply, createForumThread } from "../src/domain/forum/forumData";
import { createForumProfile, resolveForumPublicAuthor } from "../src/domain/forum/forumProfileData";
import type { StoryForumUser } from "../src/domain/forumStory/forumStoryTypes";
import type { UserIdentity } from "../src/types";

const identity: UserIdentity = { id: "user-a", name: "旧昵称", avatar: "old-avatar", signature: "", bio: "" };
const thread = createForumThread({ id: "thread-sync", identity, title: "主题", body: "正文", anonymous: false, now: 1 });
const reply = createForumReply({ id: "reply-sync", thread, existingReplies: [], identity, body: "回复", anonymous: false, now: 2 });

const updatedProfile = createForumProfile({ ...identity, name: "新昵称", avatar: "new-avatar" }, 3);
assert.equal(resolveForumPublicAuthor(thread, [updatedProfile]).displayName, "新昵称");
assert.equal(resolveForumPublicAuthor(thread, [updatedProfile]).avatar, "new-avatar");
assert.equal(resolveForumPublicAuthor(reply, [updatedProfile]).displayName, "新昵称");
assert.equal(resolveForumPublicAuthor(reply, [updatedProfile]).avatar, "new-avatar");
assert.equal(resolveForumPublicAuthor(reply, [{ ...updatedProfile, avatar: undefined, avatarAssetId: "asset-a" }], { "user-a": "blob:current-avatar" }).avatar, "blob:current-avatar");

const anonymous = createForumReply({ id: "reply-anonymous", thread, existingReplies: [reply], identity, body: "匿名", anonymous: true, now: 4 });
assert.equal(resolveForumPublicAuthor(anonymous, [updatedProfile]).displayName, "匿名用户");

// StoryForumUser is a story-scoped virtual identity and is never accepted by
// the ordinary Forum profile resolver.
const storyUser: StoryForumUser = {
  id: "story-user",
  storyId: "story-a",
  displayName: "故事网友",
  userType: "observer",
  style: "旁观",
  personaSummary: "仅属于故事",
  createdAt: 1,
};
assert.equal(storyUser.storyId, "story-a");
assert.equal(resolveForumPublicAuthor({ ...thread, source: "ai-virtual", publicAuthor: { displayName: "NPC", kind: "virtual", isAnonymous: false } }, [updatedProfile]).displayName, "NPC");

console.log("forumProfileSync.test.ts passed");
