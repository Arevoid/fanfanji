import assert from "node:assert/strict";
import type { Character, UserSettings } from "../src/types";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { acceptLifeEpisode, applyLifeContinuation, emptyCharacterContinuity } from "../src/domain/memory/characterContinuity";
import { reduceContinuousLife } from "../src/domain/memory/continuousLifeState";
import { CHARACTER_CONTINUITY_KEY, loadCharacterContinuity } from "../src/core/storage/repositories/characterContinuityRepository";
import { saveKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { deleteCharacterImpression, deleteCharacterLife, editCharacterImpression, editCharacterLifeSummary, runForegroundCharacterContinuity, setCharacterLifePaused } from "../src/features/characterKnowledge/services/characterContinuityService";
const values = new Map<string, string>(); let failWrite = false;
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (failWrite) throw Error("synthetic_quota"); values.set(key, value); }, removeItem: (key: string) => values.delete(key) } } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const goal = acceptLifeEpisode({ summary: "准备分类书籍", status: "planned", activity: { goal: "分类书籍", kind: "habit", steps: ["分类旧书"] } }, scope, 100, "goal", [])!;
const progressed = applyLifeContinuation([goal], { previousEpisodeId: "goal", summary: "分类旧书完成了", status: "completed", stepIndex: 0, effects: { stress: -.1 } }, scope, 200, "done", []);
const reduced = reduceContinuousLife({ states: [], witnesses: [], previous: [goal], next: progressed, characterId: "a", userIdentityId: "u", authorizedNpcIds: [] });
values.set(CHARACTER_CONTINUITY_KEY, JSON.stringify({ ...emptyCharacterContinuity(), life: [...reduced.life, { ...goal, id: "foreign", characterId: "b" }], lifeStates: reduced.states,
  lifeWitnesses: [{ npcId: "npc", ownerCharacterId: "a", userIdentityId: "u", sourceEpisodeId: "done", acquiredAt: 200 }] }));
assert.equal(deleteCharacterLife("done", "b", "u").success, false);
assert.equal(editCharacterLifeSummary("done", "b", "u", "分类书籍完成了").success, false);
assert.equal(editCharacterLifeSummary("done", "a", "u", "换成其他目标").success, false);
assert.equal(editCharacterLifeSummary("done", "a", "u", "分类书籍已经完成，房间整齐多了").success, true);
assert.equal(loadCharacterContinuity().value.life.find((record) => record.id === "done")?.activity?.progress, 1);
assert.equal(loadCharacterContinuity().value.life.find((record) => record.id === "done")?.summaryHistory?.[0].text, "分类旧书完成了");
assert.equal(deleteCharacterLife("done", "a", "u").success, true);
let store = loadCharacterContinuity(); assert.equal(store.valid, true); assert.deepEqual(store.value.life.map((record) => record.id), ["foreign"]);
assert.equal(store.value.lifeStates![0].stress, .3); assert.equal(store.value.lifeStates![0].habits.length, 0); assert.equal(store.value.lifeStates![0].schedule.length, 0);
assert.equal(store.value.lifeWitnesses!.length, 0);
values.clear();
const fact: KnowledgeClaim = { ...scope, id: "evidence", statement: "用户认真照顾生病的朋友", kind: "fact", subject: "user", temporalStatus: "past", truthStatus: "asserted",
  confidence: .85, userConfirmed: false, recordedAt: 100, status: "active", visibility: "relation_private", schemaVersion: 1,
  source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: "evidence", messageIds: ["evidence"] } };
saveKnowledgeClaims([fact]);
const character = { id: "a", name: "角色" } as Character; const settings = { apiKey: "synthetic", selectedModel: "synthetic" } as UserSettings;
const request = async () => ({ text: JSON.stringify({ impressions: [{ category: "关怀", proposition: "我觉得对方很体贴", sourceClaimIds: [fact.id], confidence: .7 }], lifeEvents: [] }) });
assert.equal(await runForegroundCharacterContinuity({ character, settings, scope, now: 1000, visible: true, request }), "completed");
const impression = loadCharacterContinuity().value.impressions[0];
assert.equal(editCharacterImpression({...impression,proposition:"过时的旧认识"},"新的看法").success,false,"stale UI snapshots cannot replace the current view");
const before = values.get(CHARACTER_CONTINUITY_KEY); failWrite = true;
assert.equal(deleteCharacterImpression(impression.id, scope).success, false); assert.equal(values.get(CHARACTER_CONTINUITY_KEY), before); failWrite = false;
assert.equal(deleteCharacterImpression(impression.id, { ...scope, relationId: "foreign" }).success, false);
assert.equal(deleteCharacterImpression(impression.id, scope).success, true);
assert.equal(editCharacterImpression(impression,"恢复旧认识").success,false,"editing a deleted snapshot must not resurrect it");
assert.equal(await runForegroundCharacterContinuity({ character, settings, scope, now: 86401000, visible: true, request }), "completed");
assert.equal(loadCharacterContinuity().value.impressions.length, 0, "same old evidence must not regenerate the deleted impression");
// A UI mutation during a paid request invalidates that request's write lease.
values.clear(); saveKnowledgeClaims([]);
assert.equal(await runForegroundCharacterContinuity({ character, settings, scope, now: 1000, visible: true, request: async () => {
  assert.equal(setCharacterLifePaused("a", "u", true).success, true);
  return { text: JSON.stringify({ impressions: [], lifeEvents: [{ summary: "独自整理书架", status: "completed" }] }) };
} }), "storage_unavailable");
store = loadCharacterContinuity(); assert.equal(store.value.life.length, 0); assert.equal(store.value.lifeStates![0].paused, true);
console.log("PASS typed maintenance: exact scope, failed-write preservation, deleted-impression suppression, whole-goal deletion, need/habit/schedule/NPC replay and stale foreground-write rejection");
