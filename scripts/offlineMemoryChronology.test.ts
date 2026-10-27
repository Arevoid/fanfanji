import assert from "node:assert/strict";
import { createConversationSummaryRecord } from "../src/domain/characterKnowledge/conversationSummaryProjection";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { retrieveTruthForPrivatePrompt, formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";

const scope = { characterId: "c", relationId: "r", userIdentityId: "u", conversationId: "direct:r" };
const claim: KnowledgeClaim = {
  ...scope, id: "old-event", kind: "fact", subject: "relationship",
  statement: "九月发生争吵，十二月已经和好。", truthStatus: "confirmed", temporalStatus: "past",
  source: { kind: "offline_story", authorship: "user", messageIds: ["m"], producer: "test", evidenceKey: "e", statementAt: 100 },
  confidence: 1, userConfirmed: true, recordedAt: 9000, occurredAt: 9000,
  status: "active", visibility: "relation_private", schemaVersion: 1,
};
const summarize = (value: KnowledgeClaim) => createConversationSummaryRecord({ scope, claims: [value], sourceMessageIds: ["m"], generatedAt: 10000 });
const summary = summarize(claim)!;
assert.equal(summary.rangeStartAt, 100, "legacy offline occurredAt and new recording time cannot replace source coverage");
assert.equal(summary.rangeEndAt, 100);
assert.equal(summary.generatedAt, 10000);
assert.match(summary.summary, /九月发生争吵，十二月已经和好/u);
assert.equal(summarize({ ...claim, recordedAt: 20000 })!.rangeStartAt, 100, "reorganization cannot move chronology");
const undated = summarize({ ...claim, source: { ...claim.source, statementAt: undefined } })!;
assert.equal(undated.rangeStartAt, undefined, "no source date means unknown, never extraction time");
assert.equal(undated.rangeEndAt, undefined);
const relative = { ...claim, statement: "第二天我们和好了", temporalStatus: "present" as const };
const result = retrieveTruthForPrivatePrompt({ scope, queryText: "和好", claims: [relative], summaries: [], corrections: [], now: 20000 });
const prompt = formatTruthRetrievalForPrompt(result, { maxCharacters: 8000, maxTokens: 4000 });
assert.match(prompt, /剧情内明确起点/u);
assert.match(prompt, /整理、同步时间和摘要覆盖范围不是剧情日期/u);
assert.doesNotMatch(prompt, /陈述时间 1970/u, "real message timestamp cannot anchor fictional next-day chronology");
assert.match(prompt, /第二天我们和好了/u);
console.log("offline chronology: source coverage, unknown time and reorganization verified");
