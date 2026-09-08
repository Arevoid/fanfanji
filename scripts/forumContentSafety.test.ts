import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  Character,
  ForumReply,
  ForumThread,
  MemoryItem,
  Message,
  UserIdentity,
  UserSettings,
} from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import {
  buildForumProtectedNames,
  findForumPrivateNameViolation,
  isForumGeneratedReplyRelevant,
  sanitizeForumGeneratedText,
  sanitizeStoredForumContent,
  validateForumGeneratedText,
} from "../src/domain/forum/forumContentSafety";
import {
  FORUM_VIRTUAL_PROFILES,
  getForumVirtualProfile,
} from "../src/domain/forum/forumVirtualProfiles";
import {
  buildForumRelationGenerationContext,
  generateForumThreads,
  generateInitialRepliesForUserThread,
  selectForumReplyAuthors,
} from "../src/features/forum/services/forumGenerationService";
import {
  loadForumDataSafely,
  saveForumReplies,
  saveForumThreads,
} from "../src/core/storage/repositories/forumRepository";

const action = sanitizeForumGeneratedText(
  "（抬眼看了看屏幕上的留言，指尖在手机边缘轻轻敲了一下）水管漏水先关总阀。",
);
assert.equal(action.valid, true);
assert.equal(action.text, "水管漏水先关总阀。");
assert.equal(action.changed, true);

const semanticParentheses = validateForumGeneratedText("先检查存水弯（也叫回水弯），再判断是否堵塞。");
assert.equal(semanticParentheses.valid, true);
assert.match(semanticParentheses.text, /（也叫回水弯）/);

assert.equal(sanitizeForumGeneratedText("[无语] 水管可能堵了。").text, "水管可能堵了。");
for (const unsafe of [
  "[无语]",
  "[发送表情包]",
  "[语音 5秒]",
  "[图片]",
  "我发送了一张图片。",
  "![图片](data:image/png;base64,AAAA)",
  "<audio src=\"data:audio/mp3;base64,AAAA\"></audio>",
]) {
  assert.equal(validateForumGeneratedText(unsafe).valid, false, unsafe);
}

const identity: UserIdentity = {
  id: "identity-a",
  name: "顾青禾",
  avatar: "identity.png",
  signature: "",
  bio: "",
};
const characterA: Character = {
  id: "character-a",
  name: "祁澈",
  remark: "阿澈",
  avatar: "a.png",
  personality: "克制、敏锐",
  backstory: "习惯简短表达。",
};
const characterB: Character = {
  id: "character-b",
  name: "范千",
  avatar: "b.png",
  personality: "理性",
  backstory: "重视实际经验。",
};
const relationA: CharacterRelationship = {
  id: "relation-a",
  characterId: characterA.id,
  userIdentityId: identity.id,
  conversationId: "direct:relation-a",
  relationship: "friend",
  compressedMemory: "聊过小念画萨摩耶的私事",
  createdAt: 1,
  updatedAt: 1,
};
const relationB: CharacterRelationship = {
  ...relationA,
  id: "relation-b",
  characterId: characterB.id,
  conversationId: "direct:relation-b",
  compressedMemory: "另一个关系的私人内容",
};
const messages: Message[] = [{
  id: "message-a",
  characterId: characterA.id,
  relationId: relationA.id,
  conversationId: relationA.conversationId,
  sender: "user",
  content: "小念今天画了一只萨摩耶，这只是私人聊天。",
  timestamp: 1,
}];
const memories: MemoryItem[] = [{
  id: "memory-a",
  characterId: characterA.id,
  relationId: relationA.id,
  content: "记住小念喜欢画画。",
  timestamp: 1,
}];
const settings = {
  apiKey: "test-key",
  selectedModel: "test-model",
  apiEndpoint: "https://example.invalid/v1",
  identities: [identity],
} as UserSettings;

const protectedNames = buildForumProtectedNames({
  ownerIdentity: identity,
  characters: [characterA, characterB],
  structuredAliases: ["青禾"],
});
assert.ok(protectedNames.includes("顾青禾"));
assert.ok(protectedNames.includes("祁澈"));
assert.ok(protectedNames.includes("阿澈"));
assert.ok(protectedNames.includes("范千"));
assert.ok(protectedNames.includes("青禾"));
assert.equal(protectedNames.includes("小念"), false);
assert.equal(protectedNames.includes("念棠"), false);
assert.equal(protectedNames.includes(FORUM_VIRTUAL_PROFILES[0].displayName), false);
assert.equal(findForumPrivateNameViolation({
  text: "顾青禾画了一只萨摩耶。",
  protectedNames,
  publicTexts: ["水管漏水怎么办？"],
}), "顾青禾");
assert.equal(findForumPrivateNameViolation({
  text: "顾青禾说先关总阀。",
  protectedNames,
  publicTexts: ["顾青禾说水管漏水了。"],
}), undefined);
assert.equal(findForumPrivateNameViolation({
  text: "阿澈建议先关总阀。",
  protectedNames,
  allowedAuthorNames: ["阿澈"],
}), undefined);

assert.equal(isForumGeneratedReplyRelevant({
  replyBody: "水管漏水时先关总阀，再检查接口。",
  threadTitle: "水管漏水怎么办",
  threadBody: "厨房水管突然漏水。",
}), true);
assert.equal(isForumGeneratedReplyRelevant({
  replyBody: "小念今天画了一只萨摩耶。",
  threadTitle: "水管漏水怎么办",
  threadBody: "厨房水管突然漏水。",
}), false);

assert.equal(FORUM_VIRTUAL_PROFILES.length, 16);
assert.equal(getForumVirtualProfile("same-seed").id, getForumVirtualProfile("same-seed").id);
assert.equal(new Set(FORUM_VIRTUAL_PROFILES.map((profile) => profile.id)).size, 16);
assert.equal(new Set(FORUM_VIRTUAL_PROFILES.map((profile) => profile.displayName)).size, 16);

const contextA = buildForumRelationGenerationContext({
  ownerIdentityId: identity.id,
  relationship: relationA,
  characters: [characterA, characterB],
  messages,
  memories,
  worldBookEntries: [],
  identities: [identity],
});
const contextB = buildForumRelationGenerationContext({
  ownerIdentityId: identity.id,
  relationship: relationB,
  characters: [characterA, characterB],
  messages,
  memories,
  worldBookEntries: [],
  identities: [identity],
});
assert.ok(contextA && contextB);
assert.doesNotMatch(contextA.promptContext, /小念|萨摩耶|这只是私人聊天/);
const noFriendAuthors = selectForumReplyAuthors({
  count: 3,
  relationContexts: [contextA, contextB],
  random: () => 0.9,
  seed: "no-friend",
});
assert.equal(noFriendAuthors.filter((author) => author.kind === "relation").length, 0);
const atMostOneFriend = selectForumReplyAuthors({
  count: 3,
  relationContexts: [contextA, contextB],
  random: () => 0.1,
  seed: "one-friend",
});
assert.equal(atMostOneFriend.filter((author) => author.kind === "relation").length, 1);
assert.equal(atMostOneFriend.filter((author) => author.kind === "virtual").length, 2);

const now = 70_000_000;
const userThread: ForumThread = {
  id: "thread-water",
  ownerIdentityId: identity.id,
  publicAuthor: { displayName: identity.name, avatar: identity.avatar, kind: "user", isAnonymous: false },
  title: "厨房水管漏水怎么办",
  body: "接口一直滴水，应该先检查哪里？",
  source: "user",
  occurredAt: now - 10_000,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  replyCount: 0,
  createdAt: now - 10_000,
  updatedAt: now - 10_000,
};

let referenceCall = 0;
const referencedReplies = await generateInitialRepliesForUserThread({
  thread: userThread,
  existingReplies: [],
  relationships: [relationA, relationB],
  characters: [characterA, characterB],
  messages,
  memories,
  worldBookEntries: [],
  settings,
  now,
  maxReplies: 3,
  random: () => 0.9,
  aiCall: async (params) => {
    referenceCall += 1;
    assert.doesNotMatch(params.message, /小念|萨摩耶|这只是私人聊天|relation-a/);
    if (referenceCall === 1) {
      return { text: '{"body":"水管漏水先关总阀，再擦干接口。","replyToFloor":null}' };
    }
    if (referenceCall === 2) {
      return { text: '{"body":"同意，二楼说的关总阀是第一步。","replyToFloor":2}' };
    }
    return { text: '{"body":"接口滴水也可能是密封圈老化。","replyToFloor":null}' };
  },
});
assert.equal(referencedReplies.length, 3);
assert.ok(referencedReplies.every((reply) => reply.source === "ai-virtual"));
assert.equal(referencedReplies[1].replyToFloor, 2);
assert.equal(referencedReplies[1].replyToReplyId, referencedReplies[0].id);
assert.equal(referencedReplies[1].replyToAuthorName, referencedReplies[0].publicAuthor.displayName);
assert.equal(referencedReplies[1].quotedText, referencedReplies[0].body.slice(0, 120));

let invalidFloorCalls = 0;
const invalidFloorReplies = await generateInitialRepliesForUserThread({
  thread: userThread,
  existingReplies: [],
  relationships: [],
  characters: [characterA, characterB],
  messages: [],
  memories: [],
  worldBookEntries: [],
  settings,
  now,
  maxReplies: 1,
  random: () => 0.9,
  aiCall: async () => {
    invalidFloorCalls += 1;
    return { text: '{"body":"水管漏水先关总阀。","replyToFloor":99}' };
  },
});
assert.equal(invalidFloorCalls, 2, "invalid references receive at most one corrected retry");
assert.deepEqual(invalidFloorReplies, []);

let privacyRetryCalls = 0;
const privacyRejected = await generateInitialRepliesForUserThread({
  thread: userThread,
  existingReplies: [],
  relationships: [relationA],
  characters: [characterA, characterB],
  messages,
  memories,
  worldBookEntries: [],
  settings,
  now,
  maxReplies: 1,
  random: () => 0.9,
  aiCall: async () => {
    privacyRetryCalls += 1;
    return { text: '{"body":"顾青禾画萨摩耶挺好看的。","replyToFloor":null}' };
  },
});
assert.equal(privacyRetryCalls, 2);
assert.deepEqual(privacyRejected, []);

const publicNameThread = {
  ...userThread,
  id: "thread-public-name",
  body: "顾青禾说厨房水管一直漏水，应该怎么办？",
};
const publicNameReply = await generateInitialRepliesForUserThread({
  thread: publicNameThread,
  existingReplies: [],
  relationships: [],
  characters: [characterA, characterB],
  messages: [],
  memories: [],
  worldBookEntries: [],
  settings,
  now,
  maxReplies: 1,
  random: () => 0.9,
  aiCall: async () => ({
    text: '{"body":"顾青禾可以先关总阀，再检查水管密封圈。","replyToFloor":null}',
  }),
});
assert.equal(publicNameReply.length, 1);

let threadGenerationCalls = 0;
const generatedThreads = await generateForumThreads({
  ownerIdentityId: identity.id,
  count: 1,
  trigger: "lazy",
  preferredRelationId: relationA.id,
  relationships: [relationA],
  characters: [characterA, characterB],
  messages,
  memories,
  worldBookEntries: [],
  existingThreads: [],
  settings,
  now,
  random: () => 0.9,
  aiCall: async (params) => {
    threadGenerationCalls += 1;
    assert.doesNotMatch(params.message, /小念|萨摩耶|这只是私人聊天/);
    return threadGenerationCalls === 1
      ? { text: '{"title":"宠物画画","body":"顾青禾画萨摩耶很可爱。","anonymous":true}' }
      : { text: '{"title":"厨房水管维修","body":"水管漏水时先关总阀是否稳妥？","anonymous":true}' };
  },
});
assert.equal(threadGenerationCalls, 2);
assert.equal(generatedThreads.threads.length, 1);
assert.doesNotMatch(generatedThreads.threads[0].body, /顾青禾/);

const storedReplies: ForumReply[] = [
  {
    id: "ai-action",
    threadId: userThread.id,
    ownerIdentityId: identity.id,
    floor: 2,
    kind: "reply",
    publicAuthor: { displayName: "北窗听雨", kind: "virtual", isAnonymous: false },
    body: "（抬眼看了看屏幕）水管先关总阀。",
    source: "ai-virtual",
    occurredAt: now,
    baseLikeCount: 0,
    likedByIdentityIds: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ai-state-only",
    threadId: userThread.id,
    ownerIdentityId: identity.id,
    floor: 3,
    kind: "reply",
    publicAuthor: { displayName: "半杯温水", kind: "virtual", isAnonymous: false },
    body: "[无语]",
    source: "ai-virtual",
    occurredAt: now,
    baseLikeCount: 0,
    likedByIdentityIds: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ai-private",
    threadId: userThread.id,
    ownerIdentityId: identity.id,
    floor: 4,
    kind: "reply",
    publicAuthor: { displayName: "海盐苏打", kind: "virtual", isAnonymous: false },
    body: "顾青禾画萨摩耶挺好看。",
    source: "ai-virtual",
    occurredAt: now,
    baseLikeCount: 0,
    likedByIdentityIds: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "user-parentheses",
    threadId: userThread.id,
    ownerIdentityId: identity.id,
    floor: 5,
    kind: "reply",
    publicAuthor: { displayName: identity.name, kind: "user", isAnonymous: false },
    body: "先检查存水弯（也叫回水弯）。",
    source: "user",
    occurredAt: now,
    baseLikeCount: 0,
    likedByIdentityIds: [],
    createdAt: now,
    updatedAt: now,
  },
];
const storedSafe = sanitizeStoredForumContent({
  threads: [userThread],
  replies: storedReplies,
  protectedNames,
});
assert.equal(storedSafe.replies[0].floor, 2);
assert.equal(storedSafe.replies[0].body, "水管先关总阀。");
assert.equal(storedSafe.replies[1].floor, 3);
assert.equal(storedSafe.replies[1].isDeleted, true);
assert.equal(storedSafe.replies[2].floor, 4);
assert.equal(storedSafe.replies[2].isDeleted, true);
assert.equal(storedSafe.replies[3].floor, 5);
assert.equal(storedSafe.replies[3].body, "先检查存水弯（也叫回水弯）。");
const storedSafeAgain = sanitizeStoredForumContent({
  threads: storedSafe.threads,
  replies: storedSafe.replies,
  protectedNames,
});
assert.equal(storedSafeAgain.changed, false);

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
assert.equal(saveForumThreads([userThread]).success, true);
assert.equal(saveForumReplies(storedReplies).success, true);
const safelyLoaded = loadForumDataSafely({ protectedNames });
assert.deepEqual(safelyLoaded.replies.map((reply) => reply.floor), [2, 3, 4, 5]);
assert.equal(safelyLoaded.replies[0].body, "水管先关总阀。");
assert.equal(safelyLoaded.replies[1].isDeleted, true);
assert.equal(safelyLoaded.replies[2].isDeleted, true);
assert.equal(loadForumDataSafely({ protectedNames }).sanitized, false);

const generationSource = readFileSync(
  new URL("../src/features/forum/services/forumGenerationService.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(generationSource, /from\s+["'][^"']*(?:tts|imageGeneration|attachment)[^"']*["']/i);
assert.match(generationSource, /FORUM_PUBLIC_TEXT_RULES/);
assert.match(generationSource, /selectForumReplyAuthors/);

console.log(
  "PASS forum public text safety, privacy, relevance, stable NPC authors, references, and stored-content compatibility",
);
