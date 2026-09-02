import assert from "node:assert/strict";
import { buildMemoryCenterRecords, countMemoryCenterRecords, filterMemoryCenterRecords, MEMORY_CENTER_LAYER_LABELS, MEMORY_CENTER_TYPE_LABELS } from "../src/domain/memory/memoryCenterModel";

const claim = {
  id: "claim:core",
  relationId: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  conversationId: "conversation-a",
  kind: "fact" as const,
  subject: "user" as const,
  statement: "用户下周参加摄影比赛。",
  truthStatus: "confirmed" as const,
  temporalStatus: "future" as const,
  source: {
    kind: "user_message" as const,
    authorship: "user" as const,
    app: "chat" as const,
    messageIds: ["message-a"],
    producer: "test",
    evidenceKey: "evidence-a",
  },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 30,
  status: "active" as const,
  visibility: "relation_private" as const,
  schemaVersion: 1,
};

const records = buildMemoryCenterRecords({
  memories: [{ id: "legacy-a", characterId: "character-a", relationId: "relation-a", content: "旧版记忆", timestamp: 10 }],
  claims: [claim],
  summaries: [{
    id: "summary-a",
    relationId: "relation-a",
    characterId: "character-a",
    userIdentityId: "identity-a",
    conversationId: "conversation-a",
    summary: "最近讨论了摄影比赛。",
    sourceMessageIds: ["message-a"],
    sourceClaimIds: ["claim:core"],
    generatedAt: 20,
    generator: "test",
    projectionVersion: 1,
    status: "active",
    schemaVersion: 1,
  }],
  corrections: [{
    id: "correction-a",
    relationId: "relation-a",
    characterId: "character-a",
    userIdentityId: "identity-a",
    conversationId: "conversation-a",
    instruction: "回答时保持简洁。",
    sourceMessageIds: ["message-a"],
    createdAt: 1,
    updatedAt: 40,
    status: "active",
    schemaVersion: 1,
  }],
});

assert.deepEqual(countMemoryCenterRecords(records), { truth: 1, summary: 1, rule: 1, compatibility: 1 });
assert.equal(records[0]?.recordType, "rule");
assert.equal(records.find((record) => record.recordType === "truth")?.layer, "core");
assert.equal(records.find((record) => record.recordType === "truth")?.truthStatus, "confirmed");
assert.equal(MEMORY_CENTER_TYPE_LABELS.truth, "长期事实");
assert.equal(MEMORY_CENTER_LAYER_LABELS.core, "核心记忆");
assert.equal(filterMemoryCenterRecords(records, { recordType: "truth" }).length, 1);
assert.equal(filterMemoryCenterRecords(records, { characterId: "character-a", searchQuery: "摄影" }).length, 2);
assert.equal(filterMemoryCenterRecords(records, { sourceApp: "chat", status: "active" }).length, 3);

const retractedCompatibility = buildMemoryCenterRecords({
  memories: [{ id: "legacy-retracted", characterId: "character-a", relationId: "relation-a", content: "撤回事实兼容镜像", timestamp: 50, sourceKnowledgeClaimIds: ["claim:retracted"] }],
  claims: [{ ...claim, id: "claim:retracted", truthStatus: "retracted", status: "retracted" }],
  summaries: [],
  corrections: [],
}).find((record) => record.recordType === "compatibility");
assert.equal(retractedCompatibility?.status, "retracted", "compatibility mirrors inherit linked Truth retraction status");
console.log("PASS memory center categories and canonical read model");
