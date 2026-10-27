import assert from "node:assert/strict";
import { acceptLifeEpisode, applyLifeContinuation, emptyCharacterContinuity, selectCharacterContinuityContext } from "../src/domain/memory/characterContinuity";
import { isCharacterContinuityStore } from "../src/core/storage/repositories/characterContinuityRepository";
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const goal = acceptLifeEpisode({ summary: "准备整理书架，旧书太乱有些烦恼", status: "planned",
  activity: { goal: "整理书架", kind: "hobby", steps: ["分类旧书", "清理书架", "摆放书籍"], friction: "旧书太乱有些烦恼", goalId: "model-forged-id" } }, scope, 100, "plan", [])!;
assert.ok(goal); assert.equal(goal.activity?.goalId, "goal:plan"); assert.equal(goal.activity?.progress, 0);
let records = [goal];
records = applyLifeContinuation(records, { previousEpisodeId: goal.id, summary: "完成了分类旧书，心情轻松些", status: "progressed", stepIndex: 0, effects: { stress: -.1 } }, scope, 200, "step1", []);
assert.equal(records.length, 2); assert.equal(records[1].status, "planned"); assert.equal(records[1].activity?.progress, 1); assert.equal(records[1].activity?.goalId, goal.activity?.goalId);
assert.ok(records[1].activity!.stress < goal.activity!.stress);
assert.equal(applyLifeContinuation(records, { previousEpisodeId: "step1", summary: "清理书架完成了", status: "completed", stepIndex: 1 }, scope, 300, "false-finish", []).length, 2,
  "the middle step cannot complete the whole goal");
assert.equal(applyLifeContinuation(records, { previousEpisodeId: "step1", summary: "摆放书籍完成了", status: "completed", stepIndex: 2 }, scope, 300, "skip", []).length, 2);
records = applyLifeContinuation(records, { previousEpisodeId: "step1", summary: "清理书架完成了", status: "progressed", stepIndex: 1, effects: { energy: -50 } }, scope, 300, "step2", []);
assert.equal(records.length, 3); assert.ok(records[2].activity!.energy >= .5);
const refreshed = JSON.parse(JSON.stringify(records));
assert.equal(isCharacterContinuityStore({ ...emptyCharacterContinuity(), life: refreshed }), true);
records = applyLifeContinuation(refreshed, { previousEpisodeId: "step2", summary: "摆放书籍完成了，整理完毕", status: "completed", stepIndex: 2 }, scope, 400, "step3", []);
assert.equal(records[3].status, "completed"); assert.equal(records[3].activity?.progress, 3);
assert.equal(applyLifeContinuation(records, { previousEpisodeId: "step2", summary: "摆放书籍完成了", status: "completed", stepIndex: 2 }, scope, 500, "replay", []).length, 4);
assert.match(selectCharacterContinuityContext({ ...emptyCharacterContinuity(), life: records }, scope, [], "书架整理怎么样", 500), /进度 3\/3/);
assert.equal(applyLifeContinuation([goal], { previousEpisodeId: goal.id, summary: "分类旧书完成了", status: "progressed", stepIndex: 0 }, { ...scope, userIdentityId: "foreign" }, 200, "other", []).length, 1);
assert.equal(acceptLifeEpisode({ summary: "准备整理书架", status: "planned", activity: { goal: "整理书架", kind: "hobby", steps: ["偷看用户秘密"] } }, scope, 100, "bad", []), undefined);
console.log("PASS continuous life acceptance: runtime goal IDs, persisted steps/needs, preconditions, no skipping/false completion, bounded effects, refresh/replay and identity boundaries");
