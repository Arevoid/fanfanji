import assert from "node:assert/strict";
import { groundKnowledgeProposition } from "../src/domain/characterKnowledge/knowledgeProposition";
import { evolveKnowledgeClaims } from "../src/domain/characterKnowledge/knowledgeEvolution";
import { applyLifeContinuation, acceptLifeEpisode, emptyCharacterContinuity, selectCharacterContinuityContext } from "../src/domain/memory/characterContinuity";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { normalizeExtractedKnowledgeCandidate } from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import { startCharacterContinuityRuntime } from "../src/features/characterKnowledge/services/characterContinuityRuntime";
import { buildMemoryContext } from "../src/features/characterKnowledge/services/memoryContextGateway";
import { createManualKnowledgeClaim } from "../src/features/characterKnowledge/services/manualKnowledgeService";
import type { Character, UserSettings } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const manual = (id: string, statement: string, recordedAt: number) => createManualKnowledgeClaim({ id, scope, statement, recordedAt, sourceRecordId: id })!;
const manualOld = manual("manual-old", "我的宠物名是豆豆", 100);
const manualNew = manual("manual-new", "我的宠物名字现在改为团团", 200);
assert.equal(evolveKnowledgeClaims([manualOld], [manualNew])[0].supersededById, manualNew.id);
assert.equal(manual("historical", "我的宠物名以前是豆豆", 100).temporalStatus, "unknown");
assert.equal(manual("conditional", "我的宠物名如果改为团团", 100).semantics, undefined);
const claim = (id: string, statement: string, recordedAt = 100): KnowledgeClaim => ({ id, ...scope, kind: "fact", subject: "user", statement,
  temporalStatus: "present", truthStatus: "asserted", source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: id, messageIds: [id] },
  status: "active", confidence: 0.85, userConfirmed: false, recordedAt, schemaVersion: 1, visibility: "relation_private" });
for (const [attribute, oldValue, newValue] of [["宠物名", "豆豆", "团团"], ["过敏原", "花生", "芒果"], ["工作作息", "白班", "夜班"], ["紧急联系人", "爸爸", "姐姐"]]) {
  const old = claim(`old-${attribute}`, `我的${attribute}是${oldValue}`);
  old.semantics = groundKnowledgeProposition({ attribute, value: oldValue, update: "assertion" }, old);
  const next = claim(`next-${attribute}`, `我的${attribute}现在改为${newValue}`, 200);
  next.semantics = groundKnowledgeProposition({ attribute, value: newValue, update: "change" }, next);
  assert.ok(old.semantics); assert.ok(next.semantics);
  const records = evolveKnowledgeClaims([old], [next]);
  assert.equal(records[0].supersededById, next.id); assert.equal(records[0].retractionReason, "fact_changed");
  assert.equal(records[1].semantics?.value, newValue);
  const oldWithoutMetadata = { ...old, semantics: undefined };
  const changedWithoutMetadata = { ...next, semantics: undefined };
  assert.equal(evolveKnowledgeClaims([oldWithoutMetadata], [changedWithoutMetadata])[0].supersededById, next.id,
    "old source-backed attribute records remain revisable without a migration model call");
  assert.equal(evolveKnowledgeClaims(records, [next]).length, 2);
  assert.equal(evolveKnowledgeClaims([old], [{ ...next, truthStatus: "inferred" }])[0].supersededById, undefined);
  assert.equal(evolveKnowledgeClaims([old], [{ ...next, relationId: "foreign" }])[0].supersededById, undefined);
}
assert.equal(groundKnowledgeProposition({ attribute: "宠物名", value: "团团", update: "change" }, claim("bad", "我的宠物名是团团")), undefined);
assert.equal(groundKnowledgeProposition({ attribute: "宠物名", value: "团团", update: "change" }, claim("bad", "我妈妈现在把宠物名改为团团")), undefined);
assert.equal(groundKnowledgeProposition({ attribute: "宠物名", value: "团团", update: "assertion" }, claim("bad", "我的宠物名是豆豆")), undefined);
const aliasOld = claim("alias-old", "我的宠物名是豆豆");
const aliasNew = claim("alias-new", "我的宠物名字现在改为团团", 200);
assert.equal(evolveKnowledgeClaims([aliasOld], [aliasNew])[0].supersededById, aliasNew.id);
assert.equal(evolveKnowledgeClaims([claim("cat", "我的猫名字是豆豆")], [claim("dog", "我的狗名现在改为团团", 200)])[0].supersededById, undefined);
const lateHistorical = { ...aliasOld, recordedAt: 300, source: { ...aliasOld.source, statementAt: 100 } };
const current = { ...aliasNew, source: { ...aliasNew.source, statementAt: 200 } };
const historicalReplay = evolveKnowledgeClaims([current], [lateHistorical]);
assert.equal(historicalReplay[0].supersededById, undefined);
assert.equal(historicalReplay[1].supersededById, current.id);
assert.equal(groundKnowledgeProposition({ attribute: "宠物名", value: "团团", update: "change" }, claim("hearsay", "我听说宠物名现在改为团团")), undefined);
const parsed = normalizeExtractedKnowledgeCandidate({ statement: "用户的宠物名现在为团团", kind: "fact", subject: "user", temporalStatus: "present",
  sourceMessageIds: ["m"], evidenceQuote: "我的宠物名现在改为团团", proposition: { attribute: "宠物名", value: "团团", update: "change" } }, new Set(["m"]));
assert.equal(parsed?.proposition?.attribute, "宠物名");
const plan = acceptLifeEpisode({ summary: "准备整理书架", status: "planned" }, scope, 100, "plan", [])!;
for (const summary of ["去了公园散步，没有整理书架", "整理书架的计划明天再做", "可能整理好了书架", "读完了书，没有整理书架", "做完了晚饭"]) {
  assert.equal(applyLifeContinuation([plan], { previousEpisodeId: "plan", summary, status: "completed" }, scope, 200, "bad-result", []).length, 1, summary);
}
assert.equal(applyLifeContinuation([plan], { previousEpisodeId: "plan", summary: "天气不好，取消整理书架的计划", status: "cancelled" }, scope, 200, "cancel", []).length, 2);
const continued = applyLifeContinuation([plan], { previousEpisodeId: "plan", summary: "整理好了书架，将旧书分类保存", status: "completed" }, scope, 200, "result", []);
assert.equal(continued.length, 2); assert.equal(continued[0].status, "planned", "historical plan is not relabeled as a completed event");
assert.equal(continued[0].supersededById, "result"); assert.equal(continued[1].previousEpisodeId, "plan");
assert.equal(applyLifeContinuation(continued, { previousEpisodeId: "plan", summary: "又完成", status: "completed" }, scope, 300, "duplicate", []).length, 2);
assert.equal(applyLifeContinuation([plan], { previousEpisodeId: "plan", summary: "整理完", status: "completed" }, { ...scope, userIdentityId: "other" }, 200, "foreign", []).length, 1);
const prompt = selectCharacterContinuityContext({ ...emptyCharacterContinuity(), life: continued }, scope, [], "最近生活", 300);
assert.match(prompt, /整理好了书架/); assert.doesNotMatch(prompt, /准备整理书架/);
assert.equal(acceptLifeEpisode({ summary: "和小夏一起聊书", status: "completed", participantIds: ["npc"] }, scope, 300, "social", [], [{ id: "npc", name: "小夏" }])?.participantIds?.[0], "npc");
assert.equal(acceptLifeEpisode({ summary: "和陌生人一起聊书", status: "completed", participantIds: ["foreign"] }, scope, 300, "social", [], [{ id: "npc", name: "小夏" }]), undefined);
const people = [{ id: "npc", name: "小夏" }];
const socialPlan = acceptLifeEpisode({ summary: "准备和小夏一起聊书", status: "planned", participantIds: ["npc"] }, scope, 300, "social-plan", [], people)!;
assert.equal(applyLifeContinuation([socialPlan], { previousEpisodeId: socialPlan.id, summary: "和小夏一起聊了读书的感想", status: "completed" }, scope, 400, "social-result", [], people).length, 2);
assert.equal(applyLifeContinuation([socialPlan], { previousEpisodeId: socialPlan.id, summary: "和小夏一起聊了读书的感想", status: "completed" }, scope, 400, "social-result", []).length, 1,
  "revoked social permission prevents new interpersonal progression");
assert.equal(acceptLifeEpisode({ summary: "和测试用户一起聊书", status: "completed", participantIds: ["npc"] }, scope, 300, "social", ["测试用户"], [{ id: "npc", name: "测试用户" }]), undefined);
const relation = { id: "r", characterId: "a", userIdentityId: "u", conversationId: "c" } as CharacterRelationship;
for (const surface of ["chat", "regenerate", "offline", "diary", "reading", "cinema", "moment", "forum", "group"] as const) {
  assert.equal(await buildMemoryContext({ surface, relation, characterId: "a", userIdentityId: "u", query: "秘密", settings: {} as UserSettings, audience: "public" }), "");
  assert.equal(await buildMemoryContext({ surface, relation, characterId: "a", userIdentityId: "other", query: "秘密", settings: {} as UserSettings, audience: "relation_private" }), "");
}
let visible = false; const calls: string[] = [];
const runtime = startCharacterContinuityRuntime({ relationships: [relation, { ...relation, id: "missing", characterId: "deleted" }],
  characters: [{ id: "a" } as Character], settings: { apiKey: "synthetic-key" } as UserSettings, visible: () => visible,
  run: async (input) => { calls.push(input.scope.characterId); return "completed"; } });
try {
  await runtime.tick(); assert.equal(calls.length, 0);
  visible = true; await runtime.tick(); assert.deepEqual(calls, [], "foreground runtime does not buy another reflection after archive");
  runtime.stop(); await runtime.tick(); assert.deepEqual(calls, []);
} finally { runtime.stop(); }
console.log("PASS completion acceptance: general facts, authority, history, life progression, permitted NPCs, all-surface privacy and app-wide visible runtime");
