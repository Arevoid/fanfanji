import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  commitForumMutation,
  getForumSnapshotForIdentity,
  getForumStateSnapshot,
  notifyForumStateChanged,
  subscribeForumState,
} from "../src/core/storage/repositories/forumRepository";
import { appendForumReply, createForumReply, createForumThread, selectForumThreadMetrics, tombstoneForumReply } from "../src/domain/forum/forumData";
import type { UserIdentity } from "../src/types";

const values = new Map<string, string>();
const localStorageStub = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  key: (index: number) => [...values.keys()][index] ?? null,
  removeItem: (key: string) => { values.delete(key); },
  setItem: (key: string, value: string) => { values.set(key, String(value)); },
};
Object.defineProperty(globalThis, "window", { value: { localStorage: localStorageStub }, configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: localStorageStub, configurable: true });

const identityA: UserIdentity = { id: "a", name: "甲", avatar: "a.png", signature: "", bio: "" };
const identityB: UserIdentity = { id: "b", name: "乙", avatar: "b.png", signature: "", bio: "" };
const threadA = createForumThread({ id: "thread-a", identity: identityA, title: "主题", body: "正文", anonymous: false, now: 1 });
const threadB = createForumThread({ id: "thread-b", identity: identityB, title: "主题 B", body: "正文 B", anonymous: false, now: 2 });

let notifications = 0;
const unsubscribe = subscribeForumState(() => { notifications += 1; });
assert.equal(commitForumMutation({ threads: [threadA, threadB], replies: [], shares: [], generationTasks: [] }).success, true);
assert.equal(notifications, 1, "one atomic mutation broadcasts once");
const stableOne = getForumStateSnapshot();
const stableTwo = getForumStateSnapshot();
assert.equal(stableOne, stableTwo, "unchanged state keeps a stable snapshot reference");
assert.deepEqual(getForumSnapshotForIdentity("a").threads.map((thread) => thread.id), ["thread-a"]);
assert.deepEqual(getForumSnapshotForIdentity("b").threads.map((thread) => thread.id), ["thread-b"]);

const reply = createForumReply({ id: "reply-a", thread: threadA, existingReplies: [], identity: identityA, body: "回复", anonymous: false, now: 10 });
const appended = appendForumReply([threadA, threadB], [], reply);
assert.equal(commitForumMutation({ threads: appended.threads, replies: appended.replies }).success, true);
const afterReply = getForumSnapshotForIdentity("a");
assert.equal(selectForumThreadMetrics(afterReply.threads[0], afterReply.replies).effectiveReplyCount, 1);
assert.equal(selectForumThreadMetrics(afterReply.threads[0], afterReply.replies).updatedAt, 10);
const tombstoned = tombstoneForumReply(afterReply.replies, reply.id, "a", 20);
assert.equal(commitForumMutation({ replies: tombstoned }).success, true);
assert.equal(selectForumThreadMetrics(getForumSnapshotForIdentity("a").threads[0], getForumSnapshotForIdentity("a").replies).effectiveReplyCount, 0);
assert.equal(selectForumThreadMetrics(getForumSnapshotForIdentity("a").threads[0], getForumSnapshotForIdentity("a").replies).maxFloor, 2);

localStorageStub.setItem("phone_forum_threads", JSON.stringify([threadB]));
notifyForumStateChanged();
assert.deepEqual(getForumSnapshotForIdentity("a").threads, [], "external restore notification immediately switches identity snapshot");
unsubscribe();

const appForumSource = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
assert.match(appForumSource, /useSyncExternalStore/);
assert.match(appForumSource, /commitForumMutation/);
assert.doesNotMatch(appForumSource, /const \[threads, setThreads\]/);
console.log("PASS forum repository snapshot, atomic broadcast, identity isolation, and derived metrics");
