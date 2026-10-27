import assert from "node:assert/strict";
import { archiveSharedMediaMemory } from "../src/features/characterKnowledge/services/sharedMediaMemoryService";
import { loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../src/core/storage/repositories/conversationSummaryRepository";
import { retrieveTruthForPrivatePrompt, formatTruthRetrievalForPrompt, countTruthRetrievalRecords } from "../src/features/characterKnowledge/services/truthRetrievalService";
import { buildMemoryContext } from "../src/features/characterKnowledge/services/memoryContextGateway";
import type { UserSettings } from "../src/types";

// Isolated storage only. Use the real archive writer and retrieval/formatter;
// no provider, user profile, IndexedDB, or paid model is accessed.
const data = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
  removeItem: (key: string) => data.delete(key),
} } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const relation = { id: "r", characterId: "a", userIdentityId: "u", conversationId: "c", relationship: "friend" as const, createdAt: 1, updatedAt: 1 };
for (const [app, title, text] of [
  ["reading", "记忆验收-旧伞铺", "老人珍惜亡妻留下的旧伞，想再听雨落在伞上的声音。"],
  ["cinema", "记忆验收-茶杯清单", "小岚听父亲说不必因一次失败否定自己，于是决定重新学习。"],
] as const) {
  assert.equal(archiveSharedMediaMemory({ scope, app, title, recordId: app, now: 200,
    messages: [{ id: `${app}:user`, author: "user", text: `我们讨论《${title}》的人物。`, occurredAt: 100 },
      { id: `${app}:character`, author: "character", text, occurredAt: 101 }] }).success, true);
}
const claims = loadKnowledgeClaims().value, summaries = loadConversationSummaries().value;
const query = "还记得我们共读《记忆验收-旧伞铺》时聊了什么吗？《记忆验收-茶杯清单》里小岚为什么重新学习？";
const read = (extra: Partial<Parameters<typeof retrieveTruthForPrivatePrompt>[0]> = {}) => retrieveTruthForPrivatePrompt({
  scope, queryText: query, claims, summaries, corrections: [], limit: 6, maxCharacters: 1800, ...extra });
const result = read();
console.log(JSON.stringify({ anchorIds: result.diagnostics?.selectedClaimIds, selectedSnapshots: result.summaries.map(row => row.id) }));
const text = formatTruthRetrievalForPrompt(result);
assert.match(text, /亡妻留下的旧伞/);
assert.match(text, /不必因一次失败否定自己/);
assert.match(text, /作品内容与台词不属于现实经历/);
assert.ok(text.length <= 1800);
assert.ok(countTruthRetrievalRecords(result) <= 6);
const anchorTexts = claims.map(claim => claim.statement);
assert.match(formatTruthRetrievalForPrompt(read({ alreadyPromptedTexts: anchorTexts })), /亡妻留下的旧伞/,
  "a recent save notice is not coverage of the saved exchange");
assert.equal(read({ scope: { ...scope, characterId: "b", relationId: "rb" } }).summaries.length, 0);
assert.equal(read({ scope: { ...scope, userIdentityId: "other" } }).summaries.length, 0);
assert.equal(read({ scenario: "public" }).summaries.length, 0);
assert.equal(read({ claims: claims.map(claim => ({ ...claim, recallDisabled: true })) }).summaries.length, 0);
assert.equal(read({ claims: claims.map(claim => ({ ...claim, status: "retracted", truthStatus: "retracted" })) }).summaries.length, 0);
assert.equal(read({ summaries: summaries.map(summary => ({ ...summary, status: "stale" })) }).summaries.length, 0);
assert.equal(read({ alreadyPromptedMessageIds: summaries.flatMap(summary => summary.sourceMessageIds) }).summaries.length, 0);
assert.equal(read({ alreadyPromptedTexts: summaries.map(summary => summary.summary) }).summaries.length, 0);
assert.equal(read({ queryText: "今天吃面条还是米饭" }).summaries.length, 0);
assert.equal(read({ queryText: "今天天气怎么样" }).summaries.length, 0);
const one = read({ limit: 1 });
assert.ok(countTruthRetrievalRecords(one) <= 1);
assert.equal(one.summaries.length, 1, "the generic anchor must not consume the only recall slot");
assert.ok(formatTruthRetrievalForPrompt(read(), { maxCharacters: 100 }).length <= 100);
const gateway = await buildMemoryContext({ surface: "chat", relation, characterId: "a", userIdentityId: "u", query,
  settings: {} as UserSettings, audience: "relation_private", maxCharacters: 1800 });
assert.match(gateway, /亡妻留下的旧伞/);
assert.match(gateway, /不必因一次失败否定自己/);
console.log("PASS shared-media actual archive → retrieval → final prompt, without vectors or extra API requests");
