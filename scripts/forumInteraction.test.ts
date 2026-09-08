import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  Character,
  ForumGenerationTask,
  ForumReply,
  ForumThread,
  MemoryItem,
  Message,
  UserIdentity,
  UserSettings,
} from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import {
  createForumReply,
  createForumThread,
  deleteForumThread,
} from "../src/domain/forum/forumData";
import {
  beginForumGenerationTask,
  buildForumGenerationTaskKey,
  finishForumGenerationTask,
  getThreadRefreshCooldownRemaining,
  hasEvaluatedLikeEngagement,
  shouldGenerateForumActivity,
} from "../src/domain/forum/forumGenerationGuard";
import { buildForumThreadPublicSnapshot } from "../src/domain/forum/forumShare";
import { generateThreadActivity } from "../src/features/forum/services/forumGenerationService";

const now = 50_000_000;
const identity: UserIdentity = {
  id: "identity-a",
  name: "小梨花",
  avatar: "user.png",
  signature: "",
  bio: "",
};
const character: Character = {
  id: "character-a",
  name: "祁澈",
  avatar: "character.png",
  personality: "敏锐克制",
  backstory: "角色背景",
};
const relationship: CharacterRelationship = {
  id: "relation-a",
  characterId: character.id,
  userIdentityId: identity.id,
  conversationId: "direct:relation-a",
  relationship: "friend",
  compressedMemory: "当前关系摘要",
  createdAt: 1,
  updatedAt: 1,
};
const settings = {
  apiKey: "test-only",
  selectedModel: "test-model",
  apiEndpoint: "https://example.invalid/v1",
} as UserSettings;
const messages: Message[] = [{
  id: "message-a",
  characterId: character.id,
  relationId: relationship.id,
  conversationId: relationship.conversationId,
  sender: "user",
  content: "当前关系聊天",
  timestamp: 1,
}];
const memories: MemoryItem[] = [{
  id: "memory-a",
  characterId: character.id,
  relationId: relationship.id,
  content: "当前关系记忆",
  timestamp: 1,
}];

const realThread = createForumThread({
  id: "thread-real",
  identity,
  title: "实名帖子",
  body: "实名正文",
  anonymous: false,
  now,
});
const anonymousThread = createForumThread({
  id: "thread-anonymous",
  identity,
  title: "匿名帖子",
  body: "匿名正文",
  anonymous: true,
  now,
});
assert.equal(realThread.publicAuthor.displayName, identity.name);
assert.equal(realThread.publicAuthor.kind, "user");
assert.equal(anonymousThread.publicAuthor.displayName, "匿名用户");
assert.equal(anonymousThread.publicAuthor.kind, "anonymous-user");

const realReply = createForumReply({
  id: "reply-real",
  thread: anonymousThread,
  existingReplies: [],
  identity,
  body: "我主动实名回复",
  anonymous: false,
  now: now + 1,
});
const anonymousReply = createForumReply({
  id: "reply-anonymous",
  thread: anonymousThread,
  existingReplies: [realReply],
  identity,
  body: "匿名回复",
  anonymous: true,
  replyTo: realReply,
  now: now + 2,
});
assert.equal(realReply.kind, "reply");
assert.equal(realReply.publicAuthor.displayName, identity.name);
assert.equal(anonymousReply.publicAuthor.displayName, "匿名用户");
assert.equal(anonymousReply.publicAuthor.kind, "anonymous-user");
assert.equal(anonymousReply.publicAuthor.isAnonymous, true);
assert.equal(anonymousReply.replyToAuthorName, identity.name);
assert.doesNotMatch(JSON.stringify({
  publicAuthor: anonymousReply.publicAuthor,
  replyToAuthorName: anonymousReply.replyToAuthorName,
  quotedText: anonymousReply.quotedText,
}), /identity-a/);

let rngCalls = 0;
assert.equal(shouldGenerateForumActivity(() => {
  rngCalls += 1;
  return 0.9;
}, 0.3), false);
assert.equal(rngCalls, 1);

const likeTaskKey = buildForumGenerationTaskKey({
  ownerIdentityId: identity.id,
  threadId: realThread.id,
  trigger: "like-engagement",
  windowKey: "once",
});
const likeBegin = beginForumGenerationTask({
  tasks: [],
  id: "like-task",
  taskKey: likeTaskKey,
  ownerIdentityId: identity.id,
  threadId: realThread.id,
  trigger: "like-engagement",
  now,
});
assert.ok(likeBegin.task);
const evaluatedTasks = finishForumGenerationTask(likeBegin.tasks, "like-task", "succeeded", now + 1);
assert.equal(hasEvaluatedLikeEngagement(evaluatedTasks, identity.id, realThread.id), true);
assert.equal(beginForumGenerationTask({
  tasks: evaluatedTasks,
  id: "like-task-again",
  taskKey: likeTaskKey,
  ownerIdentityId: identity.id,
  threadId: realThread.id,
  trigger: "like-engagement",
  now: now + 2,
}).task, undefined);

let missedApiCalls = 0;
const missed = await generateThreadActivity({
  trigger: "like-engagement",
  ownerIdentityId: identity.id,
  thread: realThread,
  existingReplies: [],
  relationships: [relationship],
  characters: [character],
  messages,
  memories,
  worldBookEntries: [],
  settings,
  now,
  random: () => 0.9,
  aiCall: async () => {
    missedApiCalls += 1;
    return { text: '{"body":"不应调用"}' };
  },
});
assert.equal(missed.outcome, "no-update");
assert.equal(missedApiCalls, 0);

let manualMissedApiCalls = 0;
const manualMissed = await generateThreadActivity({
  trigger: "manual-thread-refresh",
  ownerIdentityId: identity.id,
  thread: realThread,
  existingReplies: [],
  relationships: [relationship],
  characters: [character],
  messages,
  memories,
  worldBookEntries: [],
  settings,
  now,
  random: () => 0.9,
  aiCall: async () => {
    manualMissedApiCalls += 1;
    return { text: '{"body":"不应调用"}' };
  },
});
assert.equal(manualMissed.outcome, "no-update");
assert.equal(manualMissedApiCalls, 0);

const anonymousAiThread: ForumThread = {
  ...anonymousThread,
  id: "anonymous-ai-thread",
  source: "ai-character-anonymous",
  publicAuthor: { displayName: "匿名用户", kind: "anonymous-ai", isAnonymous: true },
  privateAuthorRelationId: relationship.id,
  privateAuthorCharacterId: character.id,
};
const authorRandomValues = [0.1, 0.1];
const authorUpdate = await generateThreadActivity({
  trigger: "manual-thread-refresh",
  ownerIdentityId: identity.id,
  thread: anonymousAiThread,
  existingReplies: [],
  relationships: [relationship],
  characters: [character],
  messages,
  memories,
  worldBookEntries: [],
  settings,
  now: now + 100,
  random: () => authorRandomValues.shift() ?? 0,
  aiCall: async (params) => {
    assert.match(params.message, /不得复述私人聊天/);
    assert.doesNotMatch(params.message, /当前关系聊天|当前关系记忆/);
    return { text: '{"body":"匿名帖子的后续更新","replyToFloor":null}' };
  },
});
assert.equal(authorUpdate.outcome, "author-update");
assert.equal(authorUpdate.replies[0].kind, "author-update");
assert.equal(authorUpdate.replies[0].publicAuthor.displayName, "匿名用户");
assert.equal("privateAuthorRelationId" in authorUpdate.replies[0], false);
assert.equal("privateAuthorCharacterId" in authorUpdate.replies[0], false);
assert.doesNotMatch(JSON.stringify(authorUpdate.replies[0].publicAuthor), /relation-a|character-a/);

const userRandomValues = [0.1, 0.1];
const userActivity = await generateThreadActivity({
  trigger: "manual-thread-refresh",
  ownerIdentityId: identity.id,
  thread: realThread,
  existingReplies: [{ ...realReply, threadId: realThread.id, floor: 5 }],
  relationships: [relationship],
  characters: [character],
  messages,
  memories,
  worldBookEntries: [],
  settings,
  now: now + 200,
  random: () => userRandomValues.shift() ?? 0,
  aiCall: async () => ({ text: '{"body":"实名帖子的新回复","anonymous":false,"replyToFloor":null}' }),
});
assert.equal(userActivity.outcome, "replies");
assert.equal(userActivity.replies[0].kind, "reply");
assert.equal(userActivity.replies[0].floor, 6);
assert.notEqual(userActivity.replies[0].publicAuthor.displayName, identity.name);

const manualTask: ForumGenerationTask = {
  id: "manual-task",
  taskKey: "manual",
  ownerIdentityId: identity.id,
  threadId: realThread.id,
  trigger: "manual-thread-refresh",
  status: "succeeded",
  startedAt: now,
  completedAt: now,
  createdAt: now,
  updatedAt: now,
};
assert.equal(getThreadRefreshCooldownRemaining(
  [manualTask],
  identity.id,
  realThread.id,
  now + 30_000,
), 30_000);
assert.equal(getThreadRefreshCooldownRemaining(
  [manualTask],
  identity.id,
  realThread.id,
  now + 60_000,
), 0);

const frozenSnapshot = buildForumThreadPublicSnapshot(anonymousAiThread, authorUpdate.replies);
const deleted = deleteForumThread(
  [anonymousAiThread],
  authorUpdate.replies,
  anonymousAiThread.id,
  identity.id,
);
assert.equal(deleted.threads.length, 0);
assert.equal(frozenSnapshot.replies[0].kind, "author-update");
assert.equal(frozenSnapshot.replies[0].body, "匿名帖子的后续更新");

const forumSource = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
assert.match(forumSource, /PopoverMenu/);
assert.match(forumSource, /anchorRef=\{homeMenuAnchorRef\}/);
assert.doesNotMatch(forumSource, /<BottomSheet\s+open=\{showHomeActions\}/);
assert.match(forumSource, /replyAnonymously/);
assert.match(forumSource, /setReplyAnonymously\(false\)/);
assert.match(forumSource, /楼主更新/);
assert.match(forumSource, /setDeleteTarget\(\{ kind: "thread"/);
assert.doesNotMatch(forumSource, /className="ml-auto text-\[11px\] text-slate-300/);
assert.match(forumSource, /aria-label="取消回复指定楼层"[\s\S]*回复 \{replyingTo\.floor\} 楼/);

console.log("PASS forum interaction menu, anonymous replies, engagement idempotency, refresh cooldown, author boundaries, floors, and frozen shares");
