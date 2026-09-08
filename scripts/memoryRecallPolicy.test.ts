import assert from "node:assert/strict";
import {
  DEFAULT_MEMORY_RECALL_CHARACTER_LIMIT,
  MemoryService,
  selectMemoryItemsWithinBudget,
} from "../src/domain/memory/MemoryService";
import { rankRelevantMemories } from "../src/domain/memory/MemoryRetriever";
import type { MemoryItem } from "../src/types";

const memory = (input: Partial<MemoryItem> & Pick<MemoryItem, "id" | "content" | "timestamp">): MemoryItem => ({
  characterId: "char-a",
  ...input,
});

const memories: MemoryItem[] = [
  memory({ id: "a-old", content: "我们约好了周末去看电影", timestamp: 10, relationId: "relation-a", importance: 5 }),
  memory({ id: "a-confirmed", content: "用户明确确认喜欢科幻电影", timestamp: 20, relationId: "relation-a", importance: 5, sourceKnowledgeClaimIds: ["claim-a"] }),
  memory({ id: "a-other-conversation", content: "关系 A 的另一段会话内容", timestamp: 30, relationId: "relation-a", userIdentityId: "identity-a", conversationId: "conversation-other" }),
  memory({ id: "b-private", content: "关系 B 的电影计划", timestamp: 40, relationId: "relation-b", userIdentityId: "identity-b", conversationId: "conversation-b" }),
  memory({ id: "legacy-unscoped", content: "没有关系归属的旧记录", timestamp: 50 }),
];

const scoped = (queryText: string, options: Record<string, unknown> = {}) => MemoryService.retrieveRelevantMemories({
  characterId: "char-a",
  relationId: "relation-a",
  queryText,
  existingMemories: memories,
  limit: 5,
  scenario: "chat",
  ...options,
} as any);

assert.equal(DEFAULT_MEMORY_RECALL_CHARACTER_LIMIT > 0, true);
assert.deepEqual(scoped("电影", { excludeCanonicalMirrors: true }).map((item) => item.id), ["a-old", "a-other-conversation"]);
assert.equal(scoped("电影").some((item) => item.id === "a-confirmed"), true);
assert.equal(scoped("电影").some((item) => item.id === "b-private"), false);
assert.equal(scoped("电影").some((item) => item.id === "legacy-unscoped"), false);

assert.equal(scoped("另一段会话", { conversationId: "conversation-other" }).some((item) => item.id === "a-other-conversation"), true);
assert.equal(scoped("另一段会话", { conversationId: "conversation-current" }).some((item) => item.id === "a-other-conversation"), false);
assert.equal(scoped("电影", { userIdentityId: "identity-b" }).some((item) => item.id === "a-old"), true, "relationId remains the authoritative boundary for legacy records");

const ranked = rankRelevantMemories(memories, "char-a", "周末", { relationId: "relation-a", now: 100 });
assert.equal(ranked[0]?.memory.id, "a-old", "Chinese phrase and bigram matching should prefer the matching memory");
assert.ok(ranked[0]?.matchedTerms.includes("周末"));
assert.ok((ranked[0]?.semanticScore || 0) > 0, "ranked memories should expose deterministic semantic-vector similarity");
const paraphraseRanked = rankRelevantMemories([
  memory({ id: "paraphrase-match", content: "周末安排：一起去看电影", timestamp: 100, relationId: "relation-a" }),
  memory({ id: "paraphrase-other", content: "周末在家整理房间", timestamp: 100, relationId: "relation-a" }),
], "char-a", "周末看电影的安排", { relationId: "relation-a", now: 100 });
assert.equal(paraphraseRanked[0]?.memory.id, "paraphrase-match", "semantic similarity should reinforce a partial paraphrase match");

const limited = selectMemoryItemsWithinBudget([
  memory({ id: "first", content: "12345".repeat(12), timestamp: 1 }),
  memory({ id: "second", content: "12345".repeat(12), timestamp: 2 }),
  memory({ id: "third", content: "12345".repeat(12), timestamp: 3 }),
], { maxItems: 5, maxCharacters: 120 });
assert.deepEqual(limited.map((item) => item.id), ["first", "second"]);

const groupRecall = MemoryService.retrieveRelevantMemoriesForScopes({
  existingMemories: memories,
  scopes: [{ characterId: "char-a", relationId: "relation-a", userIdentityId: "identity-1" }, { characterId: "char-a", relationId: "relation-b", userIdentityId: "identity-b" }],
  queryText: "电影",
  limit: 2,
  maxCharacters: 1000,
});
assert.deepEqual(groupRecall.map((item) => item.id), ["a-confirmed", "b-private"]);

console.log("PASS memory recall scope, ranking, mirror exclusion, and character-budget checks");
