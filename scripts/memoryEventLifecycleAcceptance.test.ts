import assert from "node:assert/strict";
import type { KnowledgeClaim, KnowledgeEventIdentity } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { groundKnowledgeEvent, normalizeKnowledgeEvent } from "../src/domain/characterKnowledge/knowledgeEventPolicy";
import { appendKnowledgeClaims } from "../src/domain/characterKnowledge/knowledgeConflictPolicy";
import { normalizeKnowledgeClaim } from "../src/domain/characterKnowledge/knowledgeWritePolicy";
import { normalizeExtractedKnowledgeCandidate } from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
function record(id: string, statement: string, state: KnowledgeEventIdentity["state"], scheduledDate?: string): KnowledgeClaim {
  const claim: KnowledgeClaim = { id, ...scope, kind: "plan", subject: "relationship", statement, temporalStatus: "future", truthStatus: "asserted",
    recordedAt: Number(id.replace(/\D/gu, "")) || 100, confidence: .85, userConfirmed: false, status: "active", visibility: "relation_private", schemaVersion: 1,
    source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: id, messageIds: [id], evidenceQuote: statement } };
  claim.event = groundKnowledgeEvent({ activity: "看电影", state, ...(scheduledDate ? { scheduledDate } : {}) }, claim);
  assert.ok(claim.event); return claim;
}
const plan = record("e100", "我们约好2026-10-20看电影", "confirmed", "2026-10-20");
const repeat = record("e101", "还记得我们约好2026-10-20看电影", "confirmed", "2026-10-20");
let store = appendKnowledgeClaims([], [plan]); store = appendKnowledgeClaims(store, [repeat]);
assert.equal(store.length, 1); assert.ok(store[0].mergedClaimIds?.includes(repeat.id));
assert.equal(store[0].source.messageIds?.length, 2);
const rescheduled = record("e200", "看电影改到2026-10-21", "rescheduled", "2026-10-21");
store = appendKnowledgeClaims(store, [rescheduled]);
assert.equal(store[0].supersededById, rescheduled.id); assert.equal(store[1].kind, "plan");
const finished = record("e300", "我们已经完成2026-10-21看电影的约定", "completed", "2026-10-21");
store = appendKnowledgeClaims(store, [finished]);
assert.equal(store[1].supersededById, finished.id); assert.equal(store[2].temporalStatus, "past"); assert.equal(store[2].planStatus, "completed");
assert.equal(normalizeKnowledgeClaim(store[2])?.event?.activity, "看电影");
assert.equal(appendKnowledgeClaims(store, [finished]).length, 3);
assert.equal(groundKnowledgeEvent({ activity: "看电影", state: "completed" }, { ...plan, statement: "明天准备看电影", source: { ...plan.source, evidenceQuote: "明天准备看电影" } }), undefined);
assert.equal(groundKnowledgeEvent({ activity: "看电影", state: "completed" }, { ...plan, source: { ...plan.source, evidenceQuote: "没有完成看电影" } }), undefined);
assert.equal(normalizeKnowledgeEvent({ activity: "看电影", state: "confirmed", scheduledDate: "2026-02-31" }), undefined);
const otherDate = record("e110", "约好2026-10-22看电影", "confirmed", "2026-10-22");
const undatedCompletion = record("e400", "看电影已经完成了", "completed");
const ambiguous = appendKnowledgeClaims([plan, otherDate], [undatedCompletion]);
assert.equal(ambiguous[0].supersededById, undefined); assert.equal(ambiguous[1].supersededById, undefined);
assert.equal(appendKnowledgeClaims([plan], [{ ...finished, relationId: "foreign" }])[0].supersededById, undefined);
const missed = record("e500", "我们看电影的约定最终没有兑现，对方爽约了", "unfulfilled");
const closed = appendKnowledgeClaims([plan], [missed]);
assert.equal(closed[0].supersededById, missed.id); assert.equal(closed[1].planStatus, "unfulfilled"); assert.equal(closed[1].temporalStatus, "past");
const differentPlace = { ...repeat, id: "different-place", event: { ...repeat.event!, place: "北城影院" } };
assert.equal(appendKnowledgeClaims([{ ...plan, event: { ...plan.event!, place: "南城影院" } }], [differentPlace]).length, 2);
const referenced = { ...finished, id: "reference", source: { ...finished.source, evidenceQuote: "上次约好的那次银幕之约已经完成了" } };
referenced.event = groundKnowledgeEvent({ activity: "银幕之约", state: "completed", referenceClaimId: plan.id,
  referenceQuote: plan.statement, matchConfidence: .98, matchReason: "明确回指上次约定的同一次观影" }, referenced, [plan]);
assert.ok(referenced.event); assert.equal(appendKnowledgeClaims([plan], [referenced])[0].supersededById, referenced.id);
assert.equal(groundKnowledgeEvent({ ...referenced.event, referenceClaimId: "foreign" }, referenced, [plan]), undefined);
assert.equal(normalizeExtractedKnowledgeCandidate({ statement: plan.statement, kind: "plan", subject: "relationship", temporalStatus: "future",
  sourceMessageIds: ["m"], evidenceQuote: plan.statement, event: plan.event }, new Set(["m"]))?.event?.state, "confirmed");
assert.equal(groundKnowledgeEvent({ activity: "看电影", state: "unfulfilled", referenceClaimId: plan.id, referenceQuote: plan.statement,
  matchConfidence: .99, matchReason: "错误的终态推断" }, { ...plan, source: { ...plan.source, evidenceQuote: "我们没有完成看电影的约定" } }, [plan], true), undefined,
  "unfinished alone cannot close an agreement even if an independent model wrongly agrees");
const both = appendKnowledgeClaims([plan], [{ ...referenced, factDecision: { targetClaimId: plan.id, entity: "约定", attribute: "状态", value: "完成",
  operation: "change", confidence: .99, reason: "模型附加的通用状态提案", currentQuote: referenced.source.evidenceQuote!, previousQuote: plan.statement } }]);
assert.equal(both[0].supersededById, referenced.id, "a grounded lifecycle event cannot be swallowed by an incompatible generic fact proposal");
console.log("PASS event lifecycle: formal appender, repeated evidence, reschedule/history, completion, ambiguity, source and scope guards");
