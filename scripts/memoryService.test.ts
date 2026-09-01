import { strict as assert } from "node:assert";
import { MemoryService, formatExtractedMemorySummary, formatMemoriesForPrompt } from "../src/domain/memory/MemoryService";
import type { Character, MemoryItem, Message } from "../src/types";

const character: Character = { id: "a", name: "A", avatar: "", personality: "", backstory: "" };
const message = (id: string, sender: Message["sender"], content: string): Message => ({ id, characterId: "a", sender, content, timestamp: 1 });
const memory = (id: string, characterId: string, content: string, timestamp: number): MemoryItem => ({ id, characterId, content, timestamp, importance: 5 });
const memories = [
  memory("older", "a", "咖啡和旅行计划", 1),
  memory("newer", "a", "咖啡店已经约好", 2),
  memory("other", "b", "B 的私人聊天", 3),
  { id: "legacy", characterId: undefined as unknown as string, content: "旧兼容记录", timestamp: 4 },
];
const retrieve = (queryText: string, limit = 5, scenario: "chat" | "group-chat" | "proactive-message" | "offline" = "chat") =>
  MemoryService.retrieveRelevantMemories({ characterId: "a", queryText, existingMemories: memories, limit, scenario });

async function run() {
  // A-D: legacy keyword, no-match, ties, and timestamp weighting remain unchanged.
  assert.deepEqual(retrieve("咖啡").map((item) => item.id), ["newer", "older"]);
  assert.deepEqual(retrieve("不存在").map((item) => item.id), ["newer", "older"]);
  assert.deepEqual(retrieve("", 1).map((item) => item.id), ["older"]);
  assert.equal(retrieve("旅行", 1)[0].id, "older");

  // E-I: isolation and every caller scenario use the same character-scoped retriever.
  assert.deepEqual(retrieve("私人").map((item) => item.id), ["newer", "older"]);
  assert.equal(formatMemoriesForPrompt(retrieve("咖啡"), "P:\n"), "P:\n  * 咖啡店已经约好\n  * 咖啡和旅行计划");
  assert.deepEqual(retrieve("咖啡", 5, "group-chat").map((item) => item.id), ["newer", "older"]);
  assert.deepEqual(retrieve("咖啡", 5, "proactive-message").map((item) => item.id), ["newer", "older"]);
  assert.deepEqual(retrieve("咖啡", 3, "offline").map((item) => item.id), ["newer", "older"]);

  const context = {
    character,
    characterId: "a",
    relationId: "relation-a",
    userIdentityId: "identity-1",
    conversationId: "conversation-a",
    recentMessages: [message("m1", "user", "我们约好周末见面")],
    existingMemories: memories,
    scenario: "manual-summary" as const,
    apiKey: "test",
    model: "test-model",
    createId: () => "new-memory",
    currentTime: () => 99,
    formatContent: (items: readonly string[]) => formatExtractedMemorySummary("【测试归档】", items),
  };
  const extractApi = async () => ({ candidates: [{
    statement: "用户与 A 约定周末见面",
    kind: "plan" as const,
    subject: "relationship" as const,
    temporalStatus: "future" as const,
    sourceMessageIds: ["m1"],
    evidenceQuote: "我们约好周末见面",
  }] });

  // J-L: extraction, manual trigger, and immediate summary all preserve parse/format/save candidates.
  const extracted = await MemoryService.extractMemories(context, extractApi);
  assert.deepEqual(extracted.extractedMemories, [{
    ...memory("new-memory", "a", "【测试归档】\n- 我们约好周末见面", 99),
    relationId: "relation-a",
    userIdentityId: "identity-1",
    conversationId: "conversation-a",
    isManual: false,
    sourceKnowledgeClaimIds: ["claim:new-memory:0"],
  }]);
  const manual = await MemoryService.extractMemories(context, extractApi);
  assert.equal(manual.extractedMemories.length, 1);
  const immediate = await MemoryService.extractMemories({ ...context, scenario: "immediate-summary" }, extractApi);
  assert.equal(immediate.extractedMemories[0].content, "【测试归档】\n- 我们约好周末见面");

  // M-P: duplicate, API failure, save hand-off, and retry all avoid extra candidates.
  const merged = MemoryService.mergeMemories(memories, extracted.extractedMemories);
  assert.equal(MemoryService.deduplicateMemories(merged, extracted.extractedMemories[0]), true);
  const failed = await MemoryService.extractMemories(context, async () => ({ error: "offline" }));
  assert.equal(failed.extractedMemories.length, 0);
  assert.equal(failed.apiError, "offline");
  const stableShapeFailure = await MemoryService.extractMemories(context, async () => ({ items: [], error: "model unavailable" }));
  assert.equal(stableShapeFailure.apiError, "model unavailable", "an adapter error must not be mistaken for a valid empty extraction");
  assert.equal(MemoryService.mergeMemories(memories, []).length, memories.length);
  const retried = await MemoryService.extractMemories({ ...context, existingMemories: merged }, extractApi);
  assert.equal(retried.extractedMemories.length, 0);

  // Q-R: other-character and legacy missing-character records never expand visibility.
  assert.equal(retrieve("B").some((item) => item.id === "other"), false);
  assert.equal(retrieve("旧兼容记录").some((item) => item.id === "legacy"), false);

  assert.equal(MemoryService.hasMarker([memory("offline", "a", "offline-story:s:0-2", 1)], "a", "offline-story:s:0-2"), true);

  const unscoped = await MemoryService.extractMemories({
    ...context,
    relationId: undefined,
    userIdentityId: undefined,
    conversationId: undefined,
  }, async () => ({ items: ["不应进入长期记忆", "另一个候选"] }));
  assert.deepEqual(unscoped.extractedMemories, [], "缺少完整关系作用域时不得创建旧式长期记忆");
  assert.equal(unscoped.acceptedClaims.length, 0);
  assert.equal(unscoped.rejectedCandidateCount, 2);

  const aiOnly = await MemoryService.extractMemories({
    ...context,
    recentMessages: [
      ...context.recentMessages,
      message("m2", "character", "A 和用户已经约定周末见面"),
    ],
  }, async () => ({ candidates: [{
    statement: "A 和用户已经约定周末见面",
    kind: "fact" as const,
    subject: "relationship" as const,
    temporalStatus: "past" as const,
    sourceMessageIds: ["m2"],
    evidenceQuote: "A 和用户已经约定周末见面",
  }] }));
  assert.equal(aiOnly.acceptedClaims[0]?.truthStatus, "inferred", "角色自己的发言只能产生待验证认知");
  assert.deepEqual(aiOnly.extractedMemories, [], "推断认知不得回写旧版长期记忆");
  console.log("MemoryService: 18 fixed acceptance checks passed");
}

void run();
