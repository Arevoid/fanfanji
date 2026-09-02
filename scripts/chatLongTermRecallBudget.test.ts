import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countTruthRetrievalRecords, retrieveTruthForPrivatePrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";

const chatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const regenerationSource = readFileSync(new URL("../src/features/chat/hooks/useChatRegenerationAction.ts", import.meta.url), "utf8");
const groupSource = readFileSync(new URL("../src/features/chat/prompts/groupMemberPrivateContext.ts", import.meta.url), "utf8");

assert.match(chatSource, /countTruthRetrievalRecords/);
assert.match(chatSource, /relationshipSummaryCount/);
assert.match(chatSource, /topK - truthRecordCount - relationshipSummaryCount/);
assert.match(chatSource, /maxFacts: 0/);
assert.match(regenerationSource, /countTruthRetrievalRecords/);
assert.match(regenerationSource, /relationshipSummaryCount/);
assert.match(regenerationSource, /countTruthRetrievalRecords[\s\S]*relationshipSummaryCount/);
assert.match(groupSource, /input\.limit - countTruthRetrievalRecords\(truth\)/);

const scope = { relationId: "r", characterId: "c", userIdentityId: "i", conversationId: "d:r" };
const bounded = retrieveTruthForPrivatePrompt({
  scope,
  limit: 2,
  claims: [{
    ...scope,
    id: "claim",
    kind: "fact",
    subject: "user",
    statement: "用户确认了一个事实",
    truthStatus: "confirmed",
    temporalStatus: "present",
    source: { kind: "manual", authorship: "user", producer: "test", evidenceKey: "claim" },
    confidence: 1,
    userConfirmed: true,
    recordedAt: 1,
    status: "active",
    visibility: "relation_private",
    schemaVersion: 1,
  }],
  summaries: [{
    ...scope,
    id: "summary",
    summary: "摘要",
    sourceMessageIds: [],
    sourceClaimIds: [],
    generatedAt: 1,
    generator: "test",
    projectionVersion: 1,
    status: "active",
    schemaVersion: 1,
  }],
  corrections: [{
    ...scope,
    id: "correction",
    instruction: "规则",
    sourceMessageIds: [],
    createdAt: 1,
    updatedAt: 1,
    status: "active",
    schemaVersion: 1,
  }],
});
assert.equal(countTruthRetrievalRecords(bounded), 2, "the Truth-side prompt never exceeds the configured total record budget");

console.log("PASS chat long-term retrieval uses one total budget across direct, regeneration, and group paths");
