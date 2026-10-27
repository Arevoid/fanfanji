import assert from "node:assert/strict";
import type { Character, Message, UserSettings } from "../src/types";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { evolveKnowledgeClaims } from "../src/domain/characterKnowledge/knowledgeEvolution";
import { retractKnowledgeClaimsBySourceMessageIds, deduplicateKnowledgeClaimsByMeaning } from "../src/domain/characterKnowledge/knowledgeConflictPolicy";
import { formatTruthRetrievalForPrompt, retrieveTruthForPrivatePrompt, getLastTruthRetrievalDiagnostics } from "../src/features/characterKnowledge/services/truthRetrievalService";
import { acceptImpression, acceptLifeEpisode, emptyCharacterContinuity, reconcileImpressions, reviseImpression, selectCharacterContinuityContext } from "../src/domain/memory/characterContinuity";
import { replaceMemoryStores, recoverMemoryStoreTransaction } from "../src/core/storage/memoryStoreTransaction";
import { storageKeys } from "../src/core/storage/storageKeys";
import { migrateMemoryContinuity, getMemoryMigrationProgress, needsMemoryContinuityMigration } from "../src/features/characterKnowledge/services/memoryContinuityMigrationService";
import { saveMemories, loadMemories } from "../src/core/storage/repositories/memoryRepository";
import { appendMany, loadKnowledgeClaims, saveKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { runForegroundCharacterContinuity, forgetKnowledgeClaim } from "../src/features/characterKnowledge/services/characterContinuityService";
import { loadCharacterContinuity } from "../src/core/storage/repositories/characterContinuityRepository";
import { isCharacterContinuityStore } from "../src/core/storage/repositories/characterContinuityRepository";
import { restoreMemoryStoreBackup } from "../src/features/characterKnowledge/services/memoryBackupRestoreService";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { beginMemoryExtractionTask, finishMemoryExtractionTask, memoryExtractionSourcesStillCurrent } from "../src/features/characterKnowledge/services/memoryExtractionTaskService";
import { saveMessages } from "../src/core/storage/repositories/messageRepository";

const values = new Map<string, string>();
let failKey = "";
const storage = { getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { if (key === failKey) throw new Error("write_failure"); values.set(key, value); },
  removeItem: (key: string) => values.delete(key) };
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage, dispatchEvent: () => true } });
const scope = { characterId: "character-a", relationId: "relation-a", userIdentityId: "identity-a", conversationId: "direct:a" };
const claim = (id: string, statement: string, recordedAt = 100): KnowledgeClaim => ({ id, ...scope, statement, kind: "preference", subject: "user",
  temporalStatus: "present", truthStatus: "asserted", confidence: 0.85, userConfirmed: false, recordedAt, occurredAt: recordedAt,
  status: "active", visibility: "relation_private", schemaVersion: 1,
  source: { kind: "user_message", authorship: "user", messageIds: [id], evidenceGroups: [[id]], evidenceKey: id, producer: "fixture" } });

// M08-M11: current values, preserved history, scoped ambiguity and conditions.
const coffee = evolveKnowledgeClaims([], [claim("coffee", "我喜欢咖啡")]);
const semanticRepeat = evolveKnowledgeClaims(coffee, [claim("repeat-coffee", "用户喜欢咖啡。", 150)]);
assert.equal(semanticRepeat.length, 1);
assert.deepEqual(semanticRepeat[0].source.evidenceGroups, [["coffee"], ["repeat-coffee"]]);
assert.equal(retractKnowledgeClaimsBySourceMessageIds(semanticRepeat, ["coffee"])[0].status, "active");
const changed = evolveKnowledgeClaims(coffee, [claim("change", "我现在不喜欢咖啡", 200)]);
assert.equal(changed[0].supersededById, "change");
assert.equal(changed[0].status, "active", "real change preserves historical evidence");
assert.equal(evolveKnowledgeClaims(coffee, [claim("ellipsis", "我以前喜欢咖啡，现在不喜欢了", 200)])[0].supersededById, "ellipsis");
const current = retrieveTruthForPrivatePrompt({ scope, queryText: "咖啡", claims: changed, summaries: [], corrections: [], now: 300 });
assert.deepEqual(current.orderedClaims?.map((record) => record.id), ["change"]);
const history = retrieveTruthForPrivatePrompt({ scope, queryText: "以前喜欢咖啡吗", claims: changed, summaries: [], corrections: [], now: 300 });
assert.equal(history.orderedClaims?.some((record) => record.id === "coffee"), true);
assert.match(formatTruthRetrievalForPrompt(history), /历史状态/);
assert.equal(evolveKnowledgeClaims(coffee, [claim("opposite", "我不喜欢咖啡", 200)])[0].truthStatus, "disputed");
assert.equal(evolveKnowledgeClaims(coffee, [claim("latte", "我现在不喜欢拿铁", 200)])[0].supersededById, undefined);
assert.equal(evolveKnowledgeClaims(coffee, [{ ...claim("other", "我现在不喜欢咖啡", 200), relationId: "other" }])[0].supersededById, undefined);
assert.equal(evolveKnowledgeClaims(changed, [claim("change", "我现在不喜欢咖啡", 200)]).length, 2);
for (const statement of ["我妈妈现在不喜欢咖啡", "我只在熬夜时才喜欢咖啡", "如果困了我喜欢咖啡", "朋友说：我现在不喜欢咖啡"]) {
  const contextual = evolveKnowledgeClaims(coffee, [claim("conditional", statement, 200)]);
  assert.equal(contextual[1].semantics, undefined, statement);
  assert.equal(contextual[0].supersededById, undefined, statement);
  assert.equal(contextual[0].truthStatus, "asserted", statement);
}

// D03-D04: independent evidence survives loss of a source; conjoint evidence does not.
const duplicate = deduplicateKnowledgeClaimsByMeaning([claim("one", "我喜欢咖啡"), claim("two", "我喜欢咖啡", 200)]);
const survivor = retractKnowledgeClaimsBySourceMessageIds(duplicate, ["one"]);
assert.equal(survivor[0].status, "active");
assert.deepEqual(survivor[0].source.messageIds, ["two"]);
assert.equal(retractKnowledgeClaimsBySourceMessageIds(survivor, ["two"])[0].status, "retracted");
const conjunction = { ...claim("together", "用户和角色确认约定"), source: { ...claim("together", "").source, messageIds: ["a", "b"], evidenceGroups: [["a", "b"]] } };
assert.equal(retractKnowledgeClaimsBySourceMessageIds([conjunction], ["a"])[0].status, "retracted");

// M03-M05, M14: large sets, unrelated small sets and final formatted budget.
const noise = Array.from({ length: 5000 }, (_, index) => ({ ...claim(`noise-${index}`, `普通记录编号${index}`, 1000 + index), kind: "fact" as const }));
const agreement = { ...claim("old-commitment", "我们约定生日去天文馆", 1), kind: "plan" as const, temporalStatus: "future" as const, importance: 9 };
const recalled = retrieveTruthForPrivatePrompt({ scope, queryText: "天文馆约定", claims: [agreement, ...noise], summaries: [], corrections: [], now: 10_000, maxCharacters: 300 });
assert.match(formatTruthRetrievalForPrompt(recalled), /天文馆/);
assert.ok(formatTruthRetrievalForPrompt(recalled).length <= 300);
assert.deepEqual(getLastTruthRetrievalDiagnostics(scope)?.injectedClaimIds, ["old-commitment"]);
const topicalNoise = Array.from({ length: 1000 }, (_, index) => ({ ...claim(`topical-${index}`, `天文馆普通闲事编号${index}`, 1000 + index), importance: 5 }));
assert.equal(retrieveTruthForPrivatePrompt({ scope, queryText: "天文馆", claims: [agreement, ...topicalNoise], summaries: [], corrections: [], now: 10_000, limit: 1 }).orderedClaims?.[0].id,
  "old-commitment", "important old agreement survives a thousand newer equally topical ordinary records");
assert.equal(formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({ scope, queryText: "量子计算", claims: coffee, summaries: [], corrections: [] })), "");
assert.match(formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({ scope, queryText: "外面雷雨，我有点紧张", claims: [claim("thunder", "用户害怕打雷")], summaries: [], corrections: [] })), /害怕打雷/u);
const oversized = retrieveTruthForPrivatePrompt({ scope, queryText: "天文馆", claims: [{ ...agreement, statement: "天文馆".repeat(1000) }], summaries: [], corrections: [], maxCharacters: 300 });
assert.equal(formatTruthRetrievalForPrompt(oversized), "");
assert.deepEqual(oversized.diagnostics?.injectedClaimIds, [], "selected is not falsely recorded as injected");
const relative = { ...claim("relative", "昨天我手腕受伤了"), kind: "fact" as const, temporalStatus: "past" as const };
const relativePrompt = (record: KnowledgeClaim) => formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({ scope, queryText: "手腕受伤", claims: [record], summaries: [], corrections: [] }));
assert.match(relativePrompt(relative), /来源日期未明，不得按今天推断/u);
assert.match(relativePrompt({ ...relative, source: { ...relative.source, statementAt: Date.UTC(2026, 0, 2) } }), /2026-01-02.*非事件发生日期/u);

// C01-C06: subjective confidence, supporting evidence, intervention and scope.
const impression = acceptImpression({ category: "care", proposition: "我逐渐觉得对方很体贴", confidence: 1, sourceClaimIds: ["coffee"] }, scope, coffee, 300, "impression")!;
assert.equal(impression.confidence, 0.75);
for (const pending of [{ ...agreement, id: "pending" }, { ...claim("pending", "也许用户会照顾我"), kind: "hypothesis" as const }]) {
  assert.equal(acceptImpression({ category: "care", proposition: "用户很体贴", sourceClaimIds: ["pending"] }, scope, [pending], 300, "unsupported"), undefined);
}
assert.equal(acceptImpression({ category: "care", proposition: "温柔", sourceClaimIds: ["secret"] }, scope, coffee, 300, "bad"), undefined);
assert.equal(reconcileImpressions([impression], [], 300)[0].status, "invalid");
const tentative = reviseImpression([impression], { ...impression, id: "tentative-impression", proposition: "我发现之前可能误解了对方", sourceClaimIds: ["change"], recordedAt: 400 });
assert.equal(tentative[0].status, "active"); assert.equal(tentative[1].status, "candidate");
const revised = reviseImpression(tentative, { ...impression, id: "new-impression", proposition: "我发现之前误解了对方", sourceClaimIds: ["change", "independent-change"], recordedAt: 500 });
assert.equal(revised[0].status, "superseded");
assert.equal(revised[1].supersedesId, impression.id);
assert.equal(reconcileImpressions([{ ...impression, intervention: true }], [], 300)[0].status, "active");
assert.equal(selectCharacterContinuityContext({ ...emptyCharacterContinuity(), impressions: [impression] }, { ...scope, relationId: "other" }, coffee, "咖啡", 300), "");

// L03-L06: plans and own solo life cannot fabricate user participation.
assert.equal(acceptLifeEpisode({ summary: "我和用户一起去看电影", status: "completed" }, scope, 300, "shared", []), undefined);
const planned = acceptLifeEpisode({ summary: "计划整理书架", status: "planned" }, scope, 300, "plan", [])!;
const plannedContext = selectCharacterContinuityContext({ ...emptyCharacterContinuity(), life: [planned] }, scope, [], "最近做什么", 400);
assert.match(plannedContext, /尚未证明完成/u);assert.doesNotMatch(plannedContext, /已记录的虚拟生活经历/u);

// R03/T06: later-write failure rolls back earlier targets; interrupted recovery restores originals.
values.clear(); storage.setItem(storageKeys.characterKnowledgeClaims, "[]"); storage.setItem(storageKeys.conversationSummaries, "[]");
failKey = storageKeys.conversationSummaries;
const restore = replaceMemoryStores({ [storageKeys.characterKnowledgeClaims]: coffee, [storageKeys.conversationSummaries]: ["new"] });
assert.equal(restore.success, false);
assert.equal(storage.getItem(storageKeys.characterKnowledgeClaims), "[]");
failKey = "";
assert.equal(recoverMemoryStoreTransaction().success, true);
storage.setItem("phone_memory_restore_transaction_v1", JSON.stringify({ version: 1, status: "pending", before: { [storageKeys.characterKnowledgeClaims]: "[]" } }));
storage.setItem(storageKeys.characterKnowledgeClaims, JSON.stringify(coffee));
assert.equal(recoverMemoryStoreTransaction().success, true);
assert.equal(storage.getItem(storageKeys.characterKnowledgeClaims), "[]");

// T01-T04: explicit consent, orphan preservation and resumable non-model migration.
values.clear();
assert.equal(needsMemoryContinuityMigration([]), false);
const character = { id: scope.characterId, name: "测试角色", personality: "克制", backstory: "喜欢读书" } as Character;
const relationship = { id: scope.relationId, characterId: scope.characterId, userIdentityId: scope.userIdentityId,
  conversationId: scope.conversationId, updatedAt: 1, relationship: "friend" } as any;
saveMemories([{ id: "legacy-good", ...scope, content: "曾经一起参观天文馆", timestamp: 1, importance: 8 },
  { id: "legacy-orphan", characterId: "missing", content: "必须保留的旧原文", timestamp: 1, importance: 5 }]);
assert.equal(await migrateMemoryContinuity({ characters: [character], relationships: [relationship], consent: false }), undefined);
const migrated = await migrateMemoryContinuity({ characters: [character], relationships: [relationship], consent: true });
assert.equal(migrated?.status, "needs_review");
assert.equal(loadMemories([]).value[0].content, "必须保留的旧原文");
const count = loadKnowledgeClaims().value.length;
await migrateMemoryContinuity({ characters: [character], relationships: [relationship], consent: false });
assert.equal(loadKnowledgeClaims().value.length, count);
assert.ok(getMemoryMigrationProgress().value?.consentAt);
values.clear();
const batchMemories = Array.from({ length: 52 }, (_, index) => ({ id: `legacy-batch-${index}`, ...scope,
  content: `旧记录 ${index}`, timestamp: index + 1, importance: 4 }));
saveMemories(batchMemories);
let interrupted = false;
const firstPass = await migrateMemoryContinuity({ characters: [character], relationships: [relationship], consent: true,
  onProgress: (progress) => {
    if (!interrupted && progress.status === "running" && progress.completed === 25) {
      interrupted = true;
      saveMemories([...loadMemories([]).value, { ...batchMemories[0], id: "added-during-migration", content: "整理期间新增的记录" }]);
      throw new Error("synthetic_interruption");
    }
  } });
assert.equal(firstPass?.status, "failed");assert.equal(firstPass?.completed, 25);
assert.equal(loadMemories([]).value.length, 53, "interruption keeps all originals plus concurrent additions");
const resumed = await migrateMemoryContinuity({ characters: [character], relationships: [relationship], consent: false });
assert.equal(resumed?.status, "completed");assert.equal(resumed?.total, 53);assert.equal(resumed?.completed, 53);
assert.equal(loadMemories([]).value.length, 0);
assert.equal(loadKnowledgeClaims().value.length, 53, "concurrent additions join the same background migration");
values.clear();saveKnowledgeClaims([{ ...coffee[0], continuityVersion: 1 }]);
assert.equal(needsMemoryContinuityMigration([{ ...batchMemories[0], sourceKnowledgeClaimIds: ["coffee"] }], [character]), false,
  "new users and their compatibility mirrors do not receive legacy migration prompts");

// R04/R06: persistent extraction lease, mutation during provider flight and retry.
values.clear();
const message = { id: "message", ...scope, sender: "user", content: "我喜欢咖啡", timestamp: 10 } as Message;
saveMessages([message]);
const task = beginMemoryExtractionTask(scope, [message])!;
assert.ok(task);
assert.equal(beginMemoryExtractionTask(scope, [message]), undefined);
assert.equal(memoryExtractionSourcesStillCurrent(task), true);
saveMessages([{ ...message, content: "我现在不喜欢咖啡" }]);
assert.equal(memoryExtractionSourcesStillCurrent(task), false);
assert.equal(finishMemoryExtractionTask(task, "failed"), true);
assert.ok(beginMemoryExtractionTask(scope, [message]));
assert.equal(memoryExtractionSourcesStillCurrent(task), false, "a replaced lease cannot commit");

// L02/C07: no request while hidden, bounded foreground request, immutable daily history.
values.clear(); saveKnowledgeClaims(coffee);
let requests = 0;
const settings = { apiKey: "synthetic-key", selectedModel: "fixture", name: "测试用户" } as UserSettings;
const request = async () => { requests++; return { text: JSON.stringify({ impressions: [{ category: "care", proposition: "对方表达克制", sourceClaimIds: ["coffee"], confidence: 0.4 }], lifeEvents: [{ summary: "独自整理了书架", status: "completed" }] }) }; };
assert.equal(await runForegroundCharacterContinuity({ character, scope, settings, visible: false, request, now: 10_000 }), "ineligible");
assert.equal(requests, 0);
assert.equal(await runForegroundCharacterContinuity({ character, scope, settings, visible: true, request, now: 10_000 }), "completed");
assert.equal(await runForegroundCharacterContinuity({ character, scope, settings, visible: true, request, now: 11_000 }), "limited");
assert.equal(requests, 1);
assert.equal(loadCharacterContinuity().value.life.length, 1);
assert.equal(loadCharacterContinuity().value.impressions.length, 1);
saveKnowledgeClaims([...coffee, claim("new-evidence", "用户主动照顾受伤的朋友", 500)]);
assert.equal(await runForegroundCharacterContinuity({ character, scope, settings, visible: true, request, now: 12_000 }), "completed", "fresh evidence can revise after the initial daily request");
assert.equal(requests, 3, "omitted theme reference requires one additional bounded semantic comparison");
assert.equal(loadCharacterContinuity().value.life.length, 1, "reflection does not invent a second daily life event");
saveKnowledgeClaims([...coffee, claim("third-evidence", "用户帮助邻居", 600)]);
assert.equal(await runForegroundCharacterContinuity({ character, scope, settings, visible: true, request, now: 13_000 }), "limited");
assert.equal(requests, 3, "daily cap blocks further reflections including their semantic comparisons");
// D06: forgotten source cannot be reconstructed by subsequent extraction.
assert.equal(forgetKnowledgeClaim(coffee[0]).success, true);
appendMany([{ ...coffee[0], id: "re-extracted" }]);
assert.equal(loadKnowledgeClaims().value.some((record) => record.id === "re-extracted"), false);
appendMany([{ ...coffee[0], id: "paraphrased", statement: "用户喜欢咖啡。", source: { ...coffee[0].source, messageIds: ["another-source"], evidenceKey: "another-source" } }]);
assert.equal(loadKnowledgeClaims().value.some((record) => record.id === "paraphrased"), false, "forgotten proposition blocks different sources too");
saveKnowledgeClaims(coffee); // Simulate the fact-store write failing after the tombstone was durable.
assert.equal(formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({ scope, queryText: "咖啡", claims: coffee, summaries: [], corrections: [] })), "");
assert.equal(isCharacterContinuityStore({ ...emptyCharacterContinuity(), impressions: [null] }), false);
const beforeRestore = values.get("phone_character_memory_continuity_v1");
assert.equal(restoreMemoryStoreBackup({ claims: [], summaries: [], corrections: [], memories: [], continuity: { invalid: true } }).success, false);
assert.equal(values.get("phone_character_memory_continuity_v1"), beforeRestore);
const backedUp = loadCharacterContinuity().value;
assert.equal(restoreMemoryStoreBackup({ claims: coffee, summaries: [], corrections: [], memories: [], continuity: backedUp }).success, true);
assert.equal(loadCharacterContinuity().value.forgotten.length, backedUp.forgotten.length);

// Every offline source is submitted; a middle failure stops the operation before any caller commit.
values.clear();
const sources = Array.from({ length: 51 }, (_, index) => ({ ...message, id: `batch-${index}`, content: `普通话题 ${index}` }));
const covered: string[] = [];
const context = { ...scope, character, scenario: "offline" as const, recentMessages: sources, existingMemories: [], apiKey: "fixture", model: "fixture",
  createId: () => "fixture", currentTime: () => 1000, formatContent: (items: readonly string[]) => items.join("\n") };
await MemoryService.extractMemoryBatches(context, async (params) => { covered.push(...params.history.map((item) => item.id)); return { candidates: [] }; });
assert.deepEqual(covered, sources.map((item) => item.id));
let batches = 0;
const failedBatch = await MemoryService.extractMemoryBatches(context, async () => ++batches === 2 ? { error: "synthetic_failure" } : { candidates: [] });
assert.equal(failedBatch.apiError, "synthetic_failure");assert.equal(batches, 2);
console.log("PASS memory continuity acceptance: history, ambiguity, evidence, 5000-message noise, budgets, impressions, own life, rollback, consent migration, source leases and forgetting");
