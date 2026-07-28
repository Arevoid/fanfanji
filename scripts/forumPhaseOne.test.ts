import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appendForumReply,
  clearForumDataByIdentity,
  createForumReply,
  createForumThread,
  deleteForumThread,
  getForumLikeCount,
  listForumRepliesForThread,
  listForumThreadsForIdentity,
  nextForumReplyFloor,
  toggleForumReplyLike,
  toggleForumThreadLike,
  tombstoneForumReply,
} from "../src/domain/forum/forumData";
import {
  loadForumReplies,
  loadForumThreads,
  saveForumData,
} from "../src/core/storage/repositories/forumRepository";
import type { UserIdentity } from "../src/types";

const identityA: UserIdentity = {
  id: "identity-a",
  name: "小梨花",
  avatar: "identity-a.png",
  signature: "",
  bio: "",
};
const identityB: UserIdentity = {
  id: "identity-b",
  name: "饭饭",
  avatar: "identity-b.png",
  signature: "",
  bio: "",
};

const threadA = createForumThread({
  id: "thread-a",
  identity: identityA,
  title: "实名帖子",
  body: "只属于身份 A",
  anonymous: false,
  now: 100,
});
const anonymousThreadA = createForumThread({
  id: "thread-a-anonymous",
  identity: identityA,
  title: "匿名帖子",
  body: "匿名正文",
  anonymous: true,
  now: 200,
});
const threadB = createForumThread({
  id: "thread-b",
  identity: identityB,
  title: "身份 B 帖子",
  body: "只属于身份 B",
  anonymous: false,
  now: 300,
});

assert.equal(threadA.publicAuthor.displayName, identityA.name);
assert.equal(threadA.publicAuthor.avatar, identityA.avatar);
assert.equal(threadA.publicAuthor.kind, "user");
assert.equal(anonymousThreadA.publicAuthor.displayName, "匿名用户");
assert.equal(anonymousThreadA.publicAuthor.avatar, undefined);
assert.equal(anonymousThreadA.publicAuthor.kind, "anonymous-user");
assert.deepEqual(
  listForumThreadsForIdentity([threadA, anonymousThreadA, threadB], identityA.id).map((thread) => thread.id),
  ["thread-a-anonymous", "thread-a"],
);
assert.deepEqual(
  listForumThreadsForIdentity([threadA, anonymousThreadA, threadB], identityB.id).map((thread) => thread.id),
  ["thread-b"],
);

const likedOnce = toggleForumThreadLike([threadA], threadA.id, identityA.id, 400);
assert.equal(getForumLikeCount(likedOnce[0]), 1);
const likedTwice = toggleForumThreadLike(likedOnce, threadA.id, identityA.id, 500);
assert.equal(getForumLikeCount(likedTwice[0]), 0);
assert.deepEqual(likedTwice[0].likedByIdentityIds, []);

const reply2 = createForumReply({
  id: "reply-2",
  thread: threadA,
  existingReplies: [],
  identity: identityA,
  body: "第二楼",
  anonymous: false,
  now: 600,
});
const reply3 = createForumReply({
  id: "reply-3",
  thread: threadA,
  existingReplies: [reply2],
  identity: identityA,
  body: "引用第二楼",
  anonymous: false,
  replyTo: reply2,
  now: 700,
});
assert.equal(reply2.floor, 2);
assert.equal(reply3.floor, 3);
assert.equal(reply3.replyToFloor, 2);
assert.equal(reply3.replyToAuthorName, identityA.name);
assert.equal(reply3.quotedText, reply2.body);

const tombstoned = tombstoneForumReply([reply2, reply3], reply2.id, identityA.id, 800);
assert.equal(tombstoned[0].floor, 2);
assert.equal(tombstoned[0].isDeleted, true);
assert.equal(tombstoned[0].body, "该回复已删除");
assert.equal(nextForumReplyFloor(tombstoned, threadA.id), 4);
assert.deepEqual(listForumRepliesForThread(tombstoned, threadA).map((reply) => reply.floor), [2, 3]);

const replyLiked = toggleForumReplyLike([reply3], reply3.id, identityA.id, 900);
assert.equal(getForumLikeCount(replyLiked[0]), 1);
assert.equal(getForumLikeCount(toggleForumReplyLike(replyLiked, reply3.id, identityA.id, 901)[0]), 0);

const appended = appendForumReply([threadA, threadB], [], reply2);
assert.equal(appended.threads.find((thread) => thread.id === threadA.id)?.replyCount, 1);
assert.equal(appended.threads.find((thread) => thread.id === threadB.id)?.replyCount, 0);

const afterThreadDelete = deleteForumThread(
  [threadA, threadB],
  [reply2, { ...reply3, ownerIdentityId: identityB.id, threadId: threadB.id }],
  threadA.id,
  identityA.id,
);
assert.deepEqual(afterThreadDelete.threads.map((thread) => thread.id), [threadB.id]);
assert.deepEqual(afterThreadDelete.replies.map((reply) => reply.threadId), [threadB.id]);

const afterIdentityClear = clearForumDataByIdentity(
  [threadA, threadB],
  [reply2, { ...reply3, ownerIdentityId: identityB.id, threadId: threadB.id }],
  identityA.id,
);
assert.deepEqual(afterIdentityClear.threads.map((thread) => thread.id), [threadB.id]);
assert.deepEqual(afterIdentityClear.replies.map((reply) => reply.ownerIdentityId), [identityB.id]);

const values = new Map<string, string>();
const localStorageStub: Storage = {
  get length() { return values.size; },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => { values.delete(key); },
  setItem: (key, value) => { values.set(key, String(value)); },
};
Object.defineProperty(globalThis, "window", {
  value: { localStorage: localStorageStub },
  configurable: true,
});

assert.deepEqual(loadForumThreads().value, []);
assert.deepEqual(loadForumReplies().value, []);
localStorageStub.setItem("phone_forum_threads", JSON.stringify([{ id: "broken" }]));
localStorageStub.setItem("phone_forum_replies", JSON.stringify([{ floor: 2 }]));
assert.deepEqual(loadForumThreads().value, []);
assert.deepEqual(loadForumReplies().value, []);
assert.equal(saveForumData([threadA, threadB], [reply2]).success, true);
assert.deepEqual(loadForumThreads().value.map((thread) => thread.id), [threadA.id, threadB.id]);
assert.deepEqual(loadForumReplies().value.map((reply) => reply.id), [reply2.id]);

const settingsSource = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
assert.match(settingsSource, /"phone_forum_threads"/);
assert.match(settingsSource, /"phone_forum_replies"/);

const forumSource = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
assert.doesNotMatch(forumSource, /PRESEED_POSTS/);
assert.doesNotMatch(forumSource, /localStorage\./);

const storeSource = readFileSync(new URL("../src/components/AppStore.tsx", import.meta.url), "utf8");
assert.doesNotMatch(storeSource, /id === "forum"/);

console.log("PASS forum phase one identity isolation, authors, likes, floors, quotes, cleanup, persistence, backup, and unlocked install");
