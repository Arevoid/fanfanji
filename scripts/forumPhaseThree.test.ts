import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  Character,
  ForumGenerationTask,
  ForumThread,
  MemoryItem,
  Message,
  UserSettings,
  WorldBookEntry,
} from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import {
  buildForumRelationGenerationContext,
  FORUM_INITIAL_REPLY_MIN,
  FORUM_INITIAL_REPLY_MAX,
  FORUM_STORY_POST_RATIO,
  generateForumThreads,
  generateInitialRepliesForUserThread,
} from "../src/features/forum/services/forumGenerationService";
import {
  beginForumGenerationTask,
  buildForumGenerationTaskKey,
  finishForumGenerationTask,
  hasRecentSuccessfulLazyTask,
  removeForumGenerationTasksByRelation,
  removeForumGenerationTasksByRelations,
  removeForumGenerationTasksByThread,
} from "../src/domain/forum/forumGenerationGuard";
import {
  isForumThreadDuplicate,
  parseForumThreadCandidate,
  validateForumReplyTimeline,
} from "../src/domain/forum/forumValidation";
import { clearAllForumDataByIdentity } from "../src/domain/forum/forumCleanup";
import {
  loadForumGenerationTasks,
  loadForumThreads,
  saveForumGenerationTasks,
} from "../src/core/storage/repositories/forumRepository";
import { sanitizeSystemBackupValue } from "../src/features/settings/systemBackupSanitizer";

const now = 10_000_000;
const settings = {
  apiKey: "test-key-never-logged",
  selectedModel: "test-model",
  apiEndpoint: "https://example.invalid/v1",
} as UserSettings;
const character: Character = {
  id: "character-shared",
  name: "祁澈",
  avatar: "avatar.png",
  personality: "克制、敏锐",
  backstory: "虚拟角色背景",
};
const relationA: CharacterRelationship = {
  id: "relation-a",
  characterId: character.id,
  userIdentityId: "identity-a",
  conversationId: "direct:relation-a",
  relationship: "friend",
  compressedMemory: "只属于身份 A 的关系摘要",
  createdAt: 1,
  updatedAt: 1,
};
const relationB: CharacterRelationship = {
  ...relationA,
  id: "relation-b",
  userIdentityId: "identity-b",
  conversationId: "direct:relation-b",
  compressedMemory: "只属于身份 B 的关系摘要",
};
const messages: Message[] = [
  {
    id: "message-a",
    characterId: character.id,
    relationId: relationA.id,
    conversationId: relationA.conversationId,
    sender: "user",
    content: "A 私密聊天",
    timestamp: 1,
  },
  {
    id: "message-b",
    characterId: character.id,
    relationId: relationB.id,
    conversationId: relationB.conversationId,
    sender: "user",
    content: "B 私密聊天",
    timestamp: 2,
  },
];
const memories: MemoryItem[] = [
  { id: "memory-a", characterId: character.id, relationId: relationA.id, content: "A 私密记忆", timestamp: 1 },
  { id: "memory-b", characterId: character.id, relationId: relationB.id, content: "B 私密记忆", timestamp: 2 },
];
const worldBookEntries: WorldBookEntry[] = [{
  id: "world",
  title: "角色设定",
  category: "角色",
  content: "canonical 世界书",
  timestamp: 1,
  characterId: character.id,
}];

const contextA = buildForumRelationGenerationContext({
  ownerIdentityId: "identity-a",
  relationship: relationA,
  characters: [character],
  messages,
  memories,
  worldBookEntries,
});
assert.ok(contextA);
assert.match(contextA.promptContext, /可能涉及的公开生活领域（仅作线索，不是限制）/);
assert.match(contextA.promptContext, /不得复述私人聊天/);
assert.doesNotMatch(contextA.promptContext, /A 私密聊天|A 私密记忆|B 私密聊天|B 私密记忆|身份 B/);
assert.equal(buildForumRelationGenerationContext({
  ownerIdentityId: "identity-a",
  relationship: relationB,
  characters: [character],
  messages,
  memories,
  worldBookEntries,
}), undefined);

let callIndex = 0;
const prompts: string[] = [];
const generated = await generateForumThreads({
  ownerIdentityId: "identity-a",
  count: 5,
  trigger: "refresh",
  relationships: [relationA, relationB],
  characters: [character],
  messages,
  memories,
  worldBookEntries,
  existingThreads: [],
  settings,
  now,
  random: () => 0.9,
  categoryTargets: [{
    name: "现代社区",
    worldview: "现代城市生活，手机论坛是常见公共讨论场所；不得跳到古风、异世界或修仙设定。",
  }],
  aiCall: async (params) => {
    callIndex += 1;
    prompts.push(params.message);
    return {
      text: JSON.stringify({
        title: `水管维修讨论 ${callIndex}`,
        body: `家里水管漏水第 ${callIndex} 次，想讨论可靠的维修办法。`,
        anonymous: callIndex === 1,
        relationId: "forged-relation",
        characterId: "forged-character",
        replies: [
          {
            body: `水管漏水最好先关闭总阀，再联系维修人员 ${callIndex}。`,
            displayName: "虚拟回帖人",
            replyToFloor: null,
          },
          {
            body: `水管漏水时可以先拍照记录漏点和水表读数，再和物业确认维修责任 ${callIndex}。`,
            displayName: "邻居用户",
            replyToFloor: null,
          },
          {
            body: `水管漏水如果涉及公共管道，建议同时留好报修单号，后续沟通会更方便 ${callIndex}。`,
            displayName: "经验用户",
            replyToFloor: null,
          },
          {
            body: "水管漏水这条无效楼层引用不应进入有效回复数量。",
            displayName: "错误示例",
            replyToFloor: 999,
          },
        ],
      }),
    };
  },
});
assert.equal(generated.threads.length, 5);
assert.equal(FORUM_INITIAL_REPLY_MIN, 3);
assert.equal(FORUM_INITIAL_REPLY_MAX, 8);
assert.equal(FORUM_STORY_POST_RATIO, 0.5);
assert.equal(generated.threads.filter((thread) => thread.storyArc).length, 2, "five-post batches alternate story and ordinary posts at the 5:5 rate");
assert.equal(generated.replies.length, 15, "each generated post starts with three effective replies and rejects invalid floor references");
assert.ok(generated.threads.every((thread) => {
  const threadReplies = generated.replies.filter((reply) => reply.threadId === thread.id);
  return threadReplies.length >= FORUM_INITIAL_REPLY_MIN && threadReplies.length <= FORUM_INITIAL_REPLY_MAX;
}));
assert.equal(new Set(generated.threads.map((thread) => thread.occurredAt)).size, 5);
assert.ok(generated.threads.every((thread) => thread.occurredAt <= now));
assert.equal(generated.threads[0].privateAuthorRelationId, relationA.id);
assert.equal(generated.threads[0].privateAuthorCharacterId, character.id);
assert.doesNotMatch(JSON.stringify(generated), /forged-relation|forged-character/);
assert.ok(prompts.every((prompt) =>
  !prompt.includes("A 私密聊天")
  && !prompt.includes("A 私密记忆")
  && !prompt.includes("B 私密聊天")
  && !prompt.includes("B 私密记忆")));
assert.ok(prompts.every((prompt) => prompt.includes("这些只是发散灵感，不是固定题材池")));
assert.ok(prompts.every((prompt) => prompt.includes("这段世界观是边界，不是话题池")));
assert.ok(new Set(prompts.map((prompt) => {
  const match = prompt.match(/优先尝试“([^”]+)”这个角度/);
  return match?.[1] || "";
})).size >= 5, "a refresh batch should receive different topic lenses");
generated.threads.forEach((thread) => {
  const threadReplies = generated.replies.filter((reply) => reply.threadId === thread.id);
  assert.equal(validateForumReplyTimeline(thread, threadReplies), true);
});

const invalidGeneration = await generateForumThreads({
    ownerIdentityId: "identity-a",
    count: 1,
    trigger: "refresh",
    relationships: [relationA],
    characters: [character],
    messages,
    memories,
    worldBookEntries,
    existingThreads: [],
    settings,
    now,
    aiCall: async () => ({ text: "not-json" }),
  });
assert.deepEqual(invalidGeneration.threads, []);
assert.deepEqual(invalidGeneration.replies, []);
assert.throws(() => parseForumThreadCandidate('{"title":"","body":""}'), /生成内容无效/);
assert.equal(isForumThreadDuplicate(
  {
    ownerIdentityId: generated.threads[0].ownerIdentityId,
    title: generated.threads[0].title,
    body: generated.threads[0].body,
  },
  generated.threads,
), true);

const userThread: ForumThread = {
  id: "user-thread",
  ownerIdentityId: "identity-a",
  publicAuthor: { displayName: "匿名用户", kind: "anonymous-user", isAnonymous: true },
  title: "用户匿名帖子",
  body: "公开内容",
  source: "user-anonymous",
  occurredAt: now - 10_000,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  replyCount: 0,
  createdAt: now - 10_000,
  updatedAt: now - 10_000,
};
const initialReplies = await generateInitialRepliesForUserThread({
  thread: userThread,
  existingReplies: [{
    id: "unrelated-high-floor",
    threadId: "another-thread",
    ownerIdentityId: "identity-a",
    floor: 99,
    kind: "reply",
    publicAuthor: { displayName: "其他帖子用户", kind: "virtual", isAnonymous: false },
    body: "其他帖子的高楼层不得污染当前帖子。",
    source: "ai-virtual",
    occurredAt: now - 20_000,
    baseLikeCount: 0,
    likedByIdentityIds: [],
    createdAt: now - 20_000,
    updatedAt: now - 20_000,
  }],
  relationships: [relationA, relationB],
  characters: [character],
  messages,
  memories,
  worldBookEntries,
  settings,
  now,
  maxReplies: 1,
  random: () => 0.9,
  aiCall: async (params) => {
    assert.doesNotMatch(params.message, /identity-a|relation-a/);
    assert.doesNotMatch(params.message, /B 私密聊天|B 私密记忆/);
    return { text: '{"body":"这段公开内容可以再补充一些具体信息","anonymous":false,"replyToFloor":null}' };
  },
});
assert.equal(initialReplies.length, 1);
assert.equal(initialReplies[0].floor, 2);
assert.ok(initialReplies[0].occurredAt >= userThread.occurredAt);
assert.ok(initialReplies[0].occurredAt <= now);

const initialTaskKey = buildForumGenerationTaskKey({
  ownerIdentityId: "identity-a",
  trigger: "initial-replies",
  threadId: userThread.id,
});
const firstBegin = beginForumGenerationTask({
  tasks: [],
  id: "task-initial",
  taskKey: initialTaskKey,
  ownerIdentityId: "identity-a",
  threadId: userThread.id,
  trigger: "initial-replies",
  now,
});
assert.ok(firstBegin.task);
assert.equal(beginForumGenerationTask({
  tasks: firstBegin.tasks,
  id: "task-duplicate",
  taskKey: initialTaskKey,
  ownerIdentityId: "identity-a",
  threadId: userThread.id,
  trigger: "initial-replies",
  now,
}).task, undefined);
const finishedTasks = finishForumGenerationTask(firstBegin.tasks, "task-initial", "succeeded", now + 1);
assert.equal(beginForumGenerationTask({
  tasks: finishedTasks,
  id: "task-after-success",
  taskKey: initialTaskKey,
  ownerIdentityId: "identity-a",
  threadId: userThread.id,
  trigger: "initial-replies",
  now: now + 2,
}).task, undefined);

const lazyTask: ForumGenerationTask = {
  id: "lazy-task",
  taskKey: "lazy",
  ownerIdentityId: "identity-a",
  relationId: relationA.id,
  characterId: character.id,
  trigger: "lazy",
  status: "succeeded",
  startedAt: now,
  completedAt: now,
  createdAt: now,
  updatedAt: now,
};
assert.equal(hasRecentSuccessfulLazyTask([lazyTask], "identity-a", relationA.id, now + 23 * 60 * 60 * 1000), true);
assert.equal(hasRecentSuccessfulLazyTask([lazyTask], "identity-a", relationA.id, now + 24 * 60 * 60 * 1000), false);
assert.deepEqual(removeForumGenerationTasksByRelation([lazyTask], relationA.id), []);
assert.deepEqual(removeForumGenerationTasksByRelations([lazyTask], [relationA.id]), []);
assert.deepEqual(removeForumGenerationTasksByThread(
  [{ ...lazyTask, threadId: userThread.id }],
  userThread.id,
), []);

const cleanup = clearAllForumDataByIdentity({
  threads: [userThread, { ...userThread, id: "other-thread", ownerIdentityId: "identity-b" }],
  replies: initialReplies,
  shares: [],
  tasks: [lazyTask, { ...lazyTask, id: "other-task", ownerIdentityId: "identity-b" }],
  ownerIdentityId: "identity-a",
});
assert.deepEqual(cleanup.threads.map((thread) => thread.ownerIdentityId), ["identity-b"]);
assert.deepEqual(cleanup.replies, []);
assert.deepEqual(cleanup.tasks.map((task) => task.ownerIdentityId), ["identity-b"]);

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
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageStub,
  configurable: true,
});
assert.equal(saveForumGenerationTasks([lazyTask]).success, true);
assert.equal(loadForumGenerationTasks(new Set([relationA.id]), now).value.length, 1);
assert.equal(loadForumGenerationTasks(new Set(["another-relation"]), now).value.length, 0);
localStorageStub.setItem("phone_forum_generation_tasks", JSON.stringify([{
  ...lazyTask,
  id: "stale",
  status: "running",
  updatedAt: now - 11 * 60 * 1000,
}]));
assert.equal(loadForumGenerationTasks(new Set([relationA.id]), now).value[0].status, "stale");
localStorageStub.setItem("phone_forum_threads", JSON.stringify([{
  ...generated.threads[0],
  privateAuthorRelationId: "invalid-relation",
  privateAuthorCharacterId: "private-character",
}]));
const sanitizedLoadedThread = loadForumThreads(new Set([relationA.id])).value[0];
assert.equal(sanitizedLoadedThread.privateAuthorRelationId, undefined);
assert.equal(sanitizedLoadedThread.privateAuthorCharacterId, undefined);

localStorageStub.setItem("phone_character_relationships", JSON.stringify([relationA]));
const privateBackup = JSON.stringify([generated.threads[0]]);
const sanitizedThreads = sanitizeSystemBackupValue("phone_forum_threads", privateBackup);
assert.doesNotMatch(sanitizedThreads || "", /privateAuthorRelationId|privateAuthorCharacterId/);
const sanitizedTasks = sanitizeSystemBackupValue(
  "phone_forum_generation_tasks",
  JSON.stringify([lazyTask, { ...lazyTask, id: "invalid-task", relationId: "invalid-relation" }]),
);
assert.equal(JSON.parse(sanitizedTasks || "[]").length, 1);

const appChatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.doesNotMatch(appChatSource, /forumGenerationService/);
for (const relativePath of [
  "../src/features/moments/services/momentGenerator.ts",
  "../src/features/chat/services/proactiveMessageService.ts",
  "../src/features/chat/services/innerVoiceService.ts",
  "../src/features/chat/services/characterImageService.ts",
]) {
  assert.doesNotMatch(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
    /forumGenerationService/,
  );
}

console.log("PASS forum phase three generation validation, relation isolation, guards, timing, cleanup, and backup privacy");
