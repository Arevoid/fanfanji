import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appendForumShareOnce,
  buildForumThreadPublicSnapshot,
  cleanupForumDataForDeletedCharacter,
  listForumShareTargets,
  removeForumSharesByRelation,
  unlinkForumPrivateAuthorByRelation,
} from "../src/domain/forum/forumShare";
import {
  buildRelationForumContext,
  findRecentForumShareForRelation,
} from "../src/domain/prompt/forumContext";
import { deleteForumThread } from "../src/domain/forum/forumData";
import {
  loadForumShares,
  saveForumShares,
} from "../src/core/storage/repositories/forumRepository";
import { createForumShareOperation } from "../src/features/forum/services/forumShareService";
import type {
  Character,
  ForumReply,
  ForumShare,
  ForumThread,
  Message,
} from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";

const now = 1_000_000;
const relationA: CharacterRelationship = {
  id: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  conversationId: "direct:relation-a",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
};
const relationB: CharacterRelationship = {
  ...relationA,
  id: "relation-b",
  userIdentityId: "identity-b",
  conversationId: "direct:relation-b",
};
const relationOther: CharacterRelationship = {
  ...relationA,
  id: "relation-other",
  characterId: "character-b",
  conversationId: "direct:relation-other",
};
const groupRelation: CharacterRelationship = {
  ...relationA,
  id: "relation-group",
  characterId: "group-a",
  conversationId: "direct:relation-group",
};
const characters: Character[] = [
  {
    id: "character-a",
    name: "范千",
    avatar: "fan.png",
    personality: "",
    backstory: "",
  },
  {
    id: "character-b",
    name: "杨丞",
    avatar: "yang.png",
    personality: "",
    backstory: "",
  },
  {
    id: "group-a",
    name: "群聊",
    avatar: "group.png",
    personality: "",
    backstory: "",
    isGroupChat: true,
  },
];

assert.deepEqual(
  listForumShareTargets(
    [relationA, relationB, relationOther, groupRelation],
    characters,
    "identity-a",
  ).map((target) => target.relationship.id),
  ["relation-a", "relation-other"],
);

const anonymousThread: ForumThread = {
  id: "thread-anonymous",
  ownerIdentityId: "identity-a",
  publicAuthor: {
    displayName: "匿名用户",
    kind: "anonymous-ai",
    isAnonymous: true,
  },
  privateAuthorRelationId: relationA.id,
  privateAuthorCharacterId: "character-a",
  title: "匿名帖子",
  body: "这是公开正文。",
  source: "ai-character-anonymous",
  occurredAt: now - 100,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  replyCount: 1,
  createdAt: now - 100,
  updatedAt: now - 100,
};
const reply: ForumReply = {
  id: "reply-2",
  threadId: anonymousThread.id,
  ownerIdentityId: "identity-a",
  floor: 2,
  publicAuthor: {
    displayName: "匿名用户",
    kind: "anonymous-user",
    isAnonymous: true,
  },
  body: "公开回帖",
  source: "user-anonymous",
  occurredAt: now - 50,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  createdAt: now - 50,
  updatedAt: now - 50,
};

const snapshot = buildForumThreadPublicSnapshot(anonymousThread, [reply]);
const snapshotJson = JSON.stringify(snapshot);
assert.doesNotMatch(snapshotJson, /privateAuthorRelationId|privateAuthorCharacterId|relation-a|character-a/);
assert.equal(snapshot.replies[0].floor, 2);

const operation = createForumShareOperation({
  shareId: "share-a",
  messageId: "message-share-a",
  ownerIdentityId: "identity-a",
  thread: anonymousThread,
  replies: [reply],
  targetRelationship: relationA,
  characterId: "character-a",
  now,
});
assert.equal(operation.message.relationId, relationA.id);
assert.equal(operation.message.conversationId, relationA.conversationId);
assert.equal(operation.message.forumShareId, operation.share.id);
assert.equal(operation.share.sourceMessageId, operation.message.id);
assert.doesNotMatch(JSON.stringify(operation.message), /privateAuthorRelationId|privateAuthorCharacterId/);
assert.equal(appendForumShareOnce([operation.share], operation.share).length, 1);
assert.equal(
  appendForumShareOnce(
    [operation.share],
    { ...operation.share, id: "share-duplicate-message" },
  ).length,
  1,
);
assert.equal(
  appendForumShareOnce(
    [operation.share],
    {
      ...operation.share,
      id: "share-second",
      sourceMessageId: "message-share-second",
    },
  ).length,
  2,
);

const shareMessage = operation.message;
const contextInput = {
  ownerIdentityId: "identity-a",
  relationId: relationA.id,
  conversationId: relationA.conversationId,
  messages: [shareMessage],
  shares: [operation.share],
  threads: [anonymousThread],
  now,
};
const privateContext = buildRelationForumContext(contextInput);
assert.match(privateContext, /匿名帖子/);
assert.match(privateContext, /Private authorship context/);
assert.equal(buildRelationForumContext({ ...contextInput, relationId: relationOther.id }), "");
assert.equal(buildRelationForumContext({
  ...contextInput,
  ownerIdentityId: "identity-b",
  relationId: relationB.id,
  conversationId: relationB.conversationId,
  messages: [{ ...shareMessage, relationId: relationB.id, conversationId: relationB.conversationId }],
}), "");
assert.equal(buildRelationForumContext({ ...contextInput, messages: [] }), "");

const otherRelationOperation = createForumShareOperation({
  shareId: "share-other",
  messageId: "message-share-other",
  ownerIdentityId: "identity-a",
  thread: anonymousThread,
  replies: [reply],
  targetRelationship: relationOther,
  characterId: "character-b",
  now,
});
const publicOnlyContext = buildRelationForumContext({
  ...contextInput,
  relationId: relationOther.id,
  conversationId: relationOther.conversationId,
  messages: [otherRelationOperation.message],
  shares: [otherRelationOperation.share],
});
assert.match(publicOnlyContext, /匿名帖子/);
assert.doesNotMatch(publicOnlyContext, /Private authorship context/);

const subsequentMessages: Message[] = Array.from({ length: 20 }, (_, index) => ({
  id: `after-${index}`,
  characterId: "character-a",
  relationId: relationA.id,
  conversationId: relationA.conversationId,
  sender: index % 2 === 0 ? "user" : "character",
  content: `消息 ${index}`,
  timestamp: now + index + 1,
}));
assert.equal(
  findRecentForumShareForRelation({ ...contextInput, messages: [shareMessage, ...subsequentMessages] })?.id,
  operation.share.id,
);
assert.equal(
  findRecentForumShareForRelation({
    ...contextInput,
    messages: [
      shareMessage,
      ...subsequentMessages,
      { ...subsequentMessages[0], id: "after-21", timestamp: now + 100 },
    ],
  }),
  undefined,
);
assert.equal(
  findRecentForumShareForRelation({
    ...contextInput,
    now: now + 24 * 60 * 60 * 1000 + 1,
  }),
  undefined,
);

assert.deepEqual(removeForumSharesByRelation(
  [operation.share, otherRelationOperation.share],
  relationA.id,
).map((share) => share.id), [otherRelationOperation.share.id]);
const unlinked = unlinkForumPrivateAuthorByRelation([anonymousThread], relationA.id, now + 1);
assert.equal(unlinked[0].privateAuthorRelationId, undefined);
assert.equal(unlinked[0].privateAuthorCharacterId, undefined);
const characterCleanup = cleanupForumDataForDeletedCharacter({
  shares: [operation.share, otherRelationOperation.share],
  threads: [anonymousThread],
  relationIds: [relationA.id],
  characterIds: ["character-a"],
  now: now + 2,
});
assert.deepEqual(characterCleanup.shares.map((share) => share.id), [otherRelationOperation.share.id]);
assert.equal(characterCleanup.threads[0].privateAuthorRelationId, undefined);

const beforeDeleteSnapshot = structuredClone(operation.share.publicSnapshot);
const deletedOriginal = deleteForumThread(
  [anonymousThread],
  [reply],
  anonymousThread.id,
  "identity-a",
);
assert.equal(deletedOriginal.threads.length, 0);
assert.deepEqual(operation.share.publicSnapshot, beforeDeleteSnapshot);

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
assert.deepEqual(loadForumShares().value, []);
assert.equal(saveForumShares([operation.share]).success, true);
assert.deepEqual(loadForumShares().value, [operation.share]);
const maliciousShare = {
  ...operation.share,
  privateAuthorRelationId: relationA.id,
  publicSnapshot: {
    ...operation.share.publicSnapshot,
    privateAuthorCharacterId: "character-a",
  },
};
localStorageStub.setItem("phone_forum_shares", JSON.stringify([maliciousShare]));
const sanitizedShare = loadForumShares().value[0] as ForumShare & Record<string, unknown>;
assert.equal(sanitizedShare.privateAuthorRelationId, undefined);
assert.doesNotMatch(JSON.stringify(sanitizedShare), /privateAuthorRelationId|privateAuthorCharacterId/);

const settingsSource = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
assert.match(settingsSource, /"phone_forum_shares"/);
const chatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(chatSource, /buildRelationForumContext/);
assert.match(chatSource, /ForumShareCard/);
const forumSource = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
assert.match(forumSource, /createForumShareOperation/);

console.log("PASS forum phase two share isolation, frozen snapshots, prompt privacy, cleanup, idempotency, and backup");
