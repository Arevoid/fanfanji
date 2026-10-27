import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { retrieveTruthForPrivatePrompt, formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
import { inferMemoryQueryConstraints } from "../src/domain/memory/memoryQueryConstraints";
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const fact = (id: string, statement: string): KnowledgeClaim => ({ ...scope, id, statement, kind: "fact", subject: "relationship", temporalStatus: "past", truthStatus: "asserted", confidence: .85,
  userConfirmed: false, recordedAt: 100, status: "active", schemaVersion: 1, visibility: "relation_private", source: { kind: "user_message", authorship: "user", messageIds: [id], producer: "fixture", evidenceKey: id } });
const initial = { ...fact("initial", "我们原定2026-10-20看电影"), kind: "plan" as const, temporalStatus: "future" as const, validTo: 200, supersededById: "moved", retractionReason: "plan_progressed",
  event: { activity: "看电影", scheduledDate: "2026-10-20", state: "confirmed" as const, identityId: "same-event" } };
const moved = { ...fact("moved", "看电影改期到2026-10-21"), kind: "plan" as const, temporalStatus: "future" as const, supersedesId: initial.id,
  event: { activity: "看电影", scheduledDate: "2026-10-21", state: "rescheduled" as const, identityId: "same-event" } };
const independent = { ...fact("independent", "我们另约2026-10-28看电影"), event: { activity: "看电影", scheduledDate: "2026-10-28", state: "confirmed" as const, identityId: "other-event" } };
const result = retrieveTruthForPrivatePrompt({ scope, claims: [initial, moved, independent], summaries: [], corrections: [], queryText: "原定2026-10-20那次看电影的约定后来怎样了", now: 300 });
assert.deepEqual(new Set(result.orderedClaims?.map((claim) => claim.id)), new Set(["initial", "moved"]));
const prompt = formatTruthRetrievalForPrompt(result); assert.match(prompt, /历史约定状态/); assert.match(prompt, /2026-10-21/); assert.doesNotMatch(prompt, /2026-10-28/);
const cat = { ...fact("cat", "橘猫叫团团"), factIdentity: { entityId: "cat", attributeId: "name", entityLabel: "用户的橘猫", attributeLabel: "名字" } };
const dog = { ...fact("dog", "小狗叫圆圆"), factIdentity: { entityId: "dog", attributeId: "name", entityLabel: "用户的小狗", attributeLabel: "名字" } };
assert.equal(inferMemoryQueryConstraints("我的橘猫叫什么名字", [cat, dog]).entityId, "cat");
assert.equal(inferMemoryQueryConstraints("2026-02-31那次经历", [cat, dog]).eventDate, undefined);
const entities = retrieveTruthForPrivatePrompt({ scope, claims: [cat, dog], summaries: [], corrections: [], queryText: "名字", queryConstraints: { entityId: "cat" } });
assert.deepEqual(entities.orderedClaims?.map((claim) => claim.id), [cat.id]);
console.log("PASS query constraints: explicit date plus full same-event progress, independent recurring event exclusion, entity identity and invalid-date safety in final prompt");
