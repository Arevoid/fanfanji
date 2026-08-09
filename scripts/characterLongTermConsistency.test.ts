import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { projectRelationshipState } from "../src/domain/characterLife/relationshipProjection";
import { buildRelationshipTimeline } from "../src/domain/characterLife/relationshipTimelineQuery";
import type { RelationshipState } from "../src/domain/characterLife/relationshipStateTypes";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { MemoryExtractionApiParams } from "../src/domain/memory/memoryTypes";
import {
  canCreateCharacterEventFromOfflineStory,
  canSyncOfflineStoryToMemory,
} from "../src/domain/offlineStory/offlineStoryFactPolicy";
import { buildMomentPublicCognitiveContext } from "../src/domain/momentCognitive/momentPublicContextBuilder";
import { buildPublicForumCognitiveContext } from "../src/domain/publicCognitive/publicContextBuilder";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import {
  buildChatPromptContext,
  formatChatPromptContext,
} from "../src/features/characterCognitive/promptAdapters/chatPromptAdapter";
import {
  buildDiaryPromptContext,
  formatDiaryPromptContext,
} from "../src/features/characterCognitive/promptAdapters/diaryPromptAdapter";
import {
  buildMomentPromptContext,
  formatMomentPromptContext,
} from "../src/features/characterCognitive/promptAdapters/momentPromptAdapter";
import {
  buildPublicForumPostPromptContext,
  formatPublicForumPostPromptContext,
} from "../src/features/characterCognitive/promptAdapters/publicForumPostPromptAdapter";
import type { Character, MemoryItem, Message, OfflineStory } from "../src/types";

const NOW = Date.UTC(2026, 7, 3, 14, 30);
const CHARACTER_ID = "character-shen-yan";
const RELATION_A = "relation-a";
const RELATION_B = "relation-b";
const IDENTITY_A = "identity-a";
const IDENTITY_B = "identity-b";

const character: Character = {
  id: CHARACTER_ID,
  name: "沈宴",
  avatar: "",
  personality: "克制、观察细致、说话简短，不轻易使用夸张语气。",
  backstory: "临川的建筑设计师，喜欢黑咖啡和旧唱片，对猫毛过敏。",
};

const relationA = createRelationship({
  id: RELATION_A,
  characterId: CHARACTER_ID,
  userIdentityId: IDENTITY_A,
  now: 1,
});
const relationB = createRelationship({
  id: RELATION_B,
  characterId: CHARACTER_ID,
  userIdentityId: IDENTITY_B,
  now: 2,
});

const event = (
  id: string,
  relationId: string,
  userIdentityId: string,
  summary: string,
  overrides: Partial<CharacterEvent> = {},
): CharacterEvent => ({
  id,
  relationId,
  characterId: CHARACTER_ID,
  userIdentityId,
  kind: "meaningful_share",
  summary,
  source: `test:${id}`,
  occurredAt: NOW - 1_000,
  recordedAt: NOW,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
  ...overrides,
});

const memory = (id: string, relationId: string, content: string): MemoryItem => ({
  id,
  characterId: CHARACTER_ID,
  relationId,
  content,
  timestamp: NOW,
  importance: 5,
});

const message = (id: string, sender: Message["sender"], content: string): Message => ({
  id,
  characterId: CHARACTER_ID,
  relationId: RELATION_A,
  conversationId: relationA.conversationId,
  sender,
  content,
  timestamp: NOW,
});

const privateMemories: MemoryItem[] = [
  memory("memory-a", RELATION_A, "用户A对花生过敏。"),
  memory("memory-b", RELATION_B, "用户B养了一只叫松露的猫。"),
];
const privateEvents: CharacterCognitiveEventCandidate[] = [
  { event: event("event-a", RELATION_A, IDENTITY_A, "用户A归还了借阅的书。"), promptVisibility: "safe" },
  { event: event("event-b", RELATION_B, IDENTITY_B, "用户B周五不加班。"), promptVisibility: "safe" },
  { event: event("event-private", RELATION_A, IDENTITY_A, "用户A未公开的家庭争执。"), promptVisibility: "private" },
];

const timeContext = {
  now: NOW,
  date: "2026-08-03",
  time: "22:30",
  timezone: "Asia/Shanghai",
  period: "night",
};

const knowledgeBoundary = {
  known: ["雾港书店位于临川。"],
  unknown: ["其他身份的私人经历。"],
  forbidden: ["不得补写未发生的共同地点、动作或经历。"],
  rules: ["雾港书店每周一闭店。"],
};

async function testMemoryTruthContract(): Promise<void> {
  const trueEventA = "[CONFIRMED] 用户A已经归还借阅的书。";
  const falseEventB = "[UNVERIFIED MODEL CLAIM] 我们上周一起去了海边。";
  let capturedRequest: MemoryExtractionApiParams | undefined;

  const result = await MemoryService.extractMemories({
    character,
    characterId: CHARACTER_ID,
    relationId: RELATION_A,
    recentMessages: [
      message("truth-a", "user", trueEventA),
      message("false-b", "character", falseEventB),
    ],
    existingMemories: [],
    scenario: "manual-summary",
    apiKey: "test",
    model: "fake",
    createId: () => "memory-truth-a",
    currentTime: () => NOW,
    formatContent: (items) => items.join("\n"),
  }, async (request) => {
    capturedRequest = request;
    // Deterministic extraction contract: only an explicitly confirmed user
    // statement is evidence. A model assertion cannot prove its own history.
    const items = request.history
      .filter((entry) => entry.role === "user" && entry.text.startsWith("[CONFIRMED]"))
      .map((entry) => entry.text.replace("[CONFIRMED]", "").trim());
    return { items };
  });

  assert.ok(capturedRequest, "the extraction boundary receives the source conversation");
  assert.deepEqual(capturedRequest.history.map((entry) => entry.role), ["user", "model"], "source authorship is preserved");
  assert.equal(result.extractedMemories.length, 1);
  assert.match(result.extractedMemories[0]?.content ?? "", /归还借阅的书/);
  assert.doesNotMatch(result.extractedMemories[0]?.content ?? "", /海边/);
  assert.equal(result.extractedMemories[0]?.relationId, RELATION_A);
}

function makeState(relationId: string, identityId: string, sourceEvent: CharacterEvent): RelationshipState {
  const created = event(`created-${relationId}`, relationId, identityId, "关系已创建。", {
    kind: "relationship_created",
    source: "relationship",
  });
  const initial = projectRelationshipState(undefined, created);
  assert.ok(initial, "relationship_created initializes state");
  const projected = projectRelationshipState(initial, sourceEvent);
  assert.ok(projected, "matching explicit event is projected");
  return projected;
}

function testRelationshipIsolation(): void {
  const eventA = privateEvents[0].event;
  const eventB = privateEvents[1].event;
  const stateA = makeState(RELATION_A, IDENTITY_A, eventA);
  const stateB = makeState(RELATION_B, IDENTITY_B, eventB);
  const allEvents = [eventA, eventB];
  const timelineA = buildRelationshipTimeline({
    relationId: RELATION_A,
    characterId: CHARACTER_ID,
    userIdentityId: IDENTITY_A,
    events: allEvents,
    state: stateA,
    generatedAt: NOW,
  });
  const timelineB = buildRelationshipTimeline({
    relationId: RELATION_B,
    characterId: CHARACTER_ID,
    userIdentityId: IDENTITY_B,
    events: allEvents,
    state: stateB,
    generatedAt: NOW,
  });

  const contextA = buildCharacterCognitiveContext({
    character,
    relation: relationA,
    memories: privateMemories,
    events: privateEvents,
    timeContext,
    knowledgeBoundary,
    relationshipTimeline: timelineA,
  });
  const contextB = buildCharacterCognitiveContext({
    character,
    relation: relationB,
    memories: privateMemories,
    events: privateEvents,
    timeContext,
    knowledgeBoundary,
    relationshipTimeline: timelineB,
  });

  assert.deepEqual(contextA.knownFacts.map((item) => item.id), ["memory-a"]);
  assert.deepEqual(contextB.knownFacts.map((item) => item.id), ["memory-b"]);
  assert.deepEqual(contextA.recentEvents.map((item) => item.id), ["event-a"]);
  assert.deepEqual(contextB.recentEvents.map((item) => item.id), ["event-b"]);
  assert.deepEqual(contextA.relationshipTimeline?.recentEvents.map((item) => item.id), ["event-a"]);
  assert.deepEqual(contextB.relationshipTimeline?.recentEvents.map((item) => item.id), ["event-b"]);

  const chatPromptA = formatChatPromptContext(buildChatPromptContext(contextA));
  const chatPromptB = formatChatPromptContext(buildChatPromptContext(contextB));
  assert.match(chatPromptA, /花生过敏/);
  assert.doesNotMatch(chatPromptA, /松露|周五不加班/);
  assert.match(chatPromptB, /松露/);
  assert.doesNotMatch(chatPromptB, /花生过敏|归还了借阅的书/);

  const diaryA = formatDiaryPromptContext(buildDiaryPromptContext(contextA));
  assert.doesNotMatch(diaryA, /用户B|松露|周五不加班/);
  assert.doesNotMatch(diaryA, /未公开的家庭争执/);
}

function offlineStory(mode: OfflineStory["mode"], sourceMessages: Message[]): OfflineStory {
  return {
    id: `story-${mode}`,
    characterId: CHARACTER_ID,
    relationId: RELATION_A,
    conversationId: relationA.conversationId,
    title: `${mode} story`,
    createdAt: NOW - 100,
    updatedAt: NOW,
    mode,
    messages: sourceMessages.map((item) => ({ ...item, isOffline: true })),
  };
}

function testOfflineStoryIsolation(): void {
  const userContribution = message("offline-user", "user", "这是用户明确输入的续写内容。 ");
  const aiContinuation = message("offline-ai", "character", "AI补写了雪山木屋和拥抱。 ");
  const confirmedContinue = {
    story: offlineStory("continue", [userContribution, aiContinuation]),
    userConfirmed: true,
    sourceMessages: [userContribution, aiContinuation],
  };
  assert.equal(canSyncOfflineStoryToMemory(confirmedContinue), true, "confirmed direct continuation is eligible");
  assert.equal(canCreateCharacterEventFromOfflineStory(confirmedContinue), true);

  for (const mode of ["if", "director"] as const) {
    const input = {
      story: offlineStory(mode, [userContribution, aiContinuation]),
      userConfirmed: true,
      sourceMessages: [userContribution, aiContinuation],
    };
    assert.equal(canSyncOfflineStoryToMemory(input), false, `${mode} story cannot enter real Memory`);
    assert.equal(canCreateCharacterEventFromOfflineStory(input), false, `${mode} story cannot create a real event`);
  }

  const aiOnly = {
    story: offlineStory("continue", [aiContinuation]),
    userConfirmed: true,
    sourceMessages: [aiContinuation],
  };
  assert.equal(canSyncOfflineStoryToMemory(aiOnly), false, "AI-only continuation cannot enter real Memory");
  assert.equal(canCreateCharacterEventFromOfflineStory(aiOnly), false, "AI-only continuation cannot create an event");
}

function testPublicPromptBoundaries(): void {
  const publicEvent = event("public-event", RELATION_A, IDENTITY_A, "沈宴参加了公开建筑讲座。", {
    kind: "forum_public_content_published",
  });
  const privateEvent = event("private-event", RELATION_A, IDENTITY_A, "用户A未公开的家庭争执。 ");

  const momentPublicContext = buildMomentPublicCognitiveContext({
    character,
    publicMomentHistory: [
      { characterId: CHARACTER_ID, visibility: "public", authorName: character.name, content: "公开分享了一张建筑草图。", timestamp: NOW - 1_000 },
    ],
    publicFacts: [
      { characterId: CHARACTER_ID, visibility: "public", content: "沈宴喜欢旧唱片。" },
      { characterId: CHARACTER_ID, visibility: "relationship", content: "用户A对花生过敏。", isRelationshipScoped: true },
    ],
    publicEvents: [
      { event: publicEvent, visibility: "public" },
      { event: privateEvent, visibility: "private" },
    ],
    currentTime: timeContext,
  });
  const privateContextA = buildCharacterCognitiveContext({
    character,
    relation: relationA,
    memories: privateMemories,
    events: privateEvents,
    timeContext,
    knowledgeBoundary,
  });
  const momentPrompt = formatMomentPromptContext(buildMomentPromptContext(privateContextA, {
    publicContext: momentPublicContext,
  }));
  assert.match(momentPrompt, /旧唱片|公开建筑讲座|建筑草图/);
  assert.doesNotMatch(momentPrompt, /花生过敏|家庭争执|松露/);
  assert.doesNotMatch(momentPrompt, /relation-a|identity-a|conversation/);

  const forumPublicContext = buildPublicForumCognitiveContext({
    character,
    events: [
      { event: publicEvent, visibility: "public" },
      { event: privateEvent, visibility: "private" },
    ],
    worldSettings: [
      { title: "临川公开设定", content: "雾港书店每周一闭店。", visibility: "public" },
      { title: "关系秘密", content: "用户A对花生过敏。", visibility: "relationship" },
    ],
    currentTime: timeContext,
  });
  const forumPrompt = formatPublicForumPostPromptContext(buildPublicForumPostPromptContext(forumPublicContext));
  assert.match(forumPrompt, /公开建筑讲座/);
  assert.match(forumPrompt, /雾港书店每周一闭店/);
  assert.doesNotMatch(forumPrompt, /家庭争执|花生过敏|松露/);
  assert.doesNotMatch(forumPrompt, /relation-a|identity-a|conversation/);
}

function testPersonaAndWorldBookRulesReachAiBoundary(): void {
  const context = buildCharacterCognitiveContext({
    character,
    relation: relationA,
    memories: [],
    events: [],
    timeContext,
    knowledgeBoundary,
  });
  const chatContext = buildChatPromptContext(context);
  const chatSafetyBlock = formatChatPromptContext(chatContext);

  assert.equal(chatContext.persona.name, "沈宴");
  assert.match(chatContext.persona.personality, /克制|观察细致|说话简短/);
  assert.match(chatContext.persona.backstory, /建筑设计师|猫毛过敏/);
  assert.match(chatSafetyBlock, /雾港书店每周一闭店/);
  assert.match(chatSafetyBlock, /不得补写未发生的共同地点、动作或经历/);

  const forumContext = buildPublicForumCognitiveContext({
    character,
    worldSettings: [{
      title: "临川公开设定",
      content: "雾港书店每周一闭店。",
      visibility: "public",
    }],
    currentTime: timeContext,
  });
  const deterministicAiInput = formatPublicForumPostPromptContext(buildPublicForumPostPromptContext(forumContext));
  assert.match(deterministicAiInput, /克制、观察细致、说话简短/);
  assert.match(deterministicAiInput, /雾港书店每周一闭店/);
  assert.match(deterministicAiInput, /Do not infer relationships, shared scenes/);
}

const tests: Array<[string, () => void | Promise<void>]> = [
  ["Memory truth contract keeps confirmed event A and rejects model-invented event B", testMemoryTruthContract],
  ["same Character keeps Memory, Event, Timeline, Chat, Diary, and Forum DM isolated by relation", testRelationshipIsolation],
  ["IF, director, and AI-only OfflineStory content cannot enter real Memory or Event", testOfflineStoryIsolation],
  ["Moment and Public Forum prompts reject private relationship data", testPublicPromptBoundaries],
  ["persona and public WorldBook rules reach the deterministic AI input boundary", testPersonaAndWorldBookRulesReachAiBoundary],
];

for (const [name, run] of tests) {
  await run();
  console.log(`PASS ${name}`);
}

console.log(`${tests.length} Character long-term consistency suites passed`);
