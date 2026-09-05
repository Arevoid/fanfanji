import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankRelevantMemories } from "../src/domain/memory/MemoryRetriever";
import { normalizeKnowledgeClaim } from "../src/domain/characterKnowledge/knowledgeWritePolicy";
import { explainTruthProjection } from "../src/features/characterKnowledge/services/truthRetrievalService";
import type { MemoryItem } from "../src/types";

const memory: MemoryItem = {
  id: "diagnostic-memory",
  characterId: "char-a",
  relationId: "relation-a",
  userIdentityId: "identity-a",
  content: "用户喜欢海边散步",
  timestamp: 100,
  importance: 8,
};
assert.deepEqual(rankRelevantMemories([{ ...memory, recallDisabled: true }], "char-a", "海边", { relationId: "relation-a" }), [], "paused compatibility records must not be recalled");
assert.equal(rankRelevantMemories([memory], "char-a", "海边", { relationId: "relation-a" })[0]?.memory.id, memory.id);

const claim = normalizeKnowledgeClaim({
  id: "claim-diagnostic",
  relationId: "relation-a",
  characterId: "char-a",
  userIdentityId: "identity-a",
  conversationId: "conversation-a",
  kind: "fact",
  subject: "user",
  statement: "用户喜欢海边散步",
  truthStatus: "confirmed",
  temporalStatus: "timeless",
  source: { kind: "manual", authorship: "user", app: "memory", producer: "test", evidenceKey: "diagnostic" },
  confidence: 1,
  userConfirmed: true,
  recallDisabled: true,
  recordedAt: 100,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
});
assert.equal(claim?.recallDisabled, true, "paused Truth claims must survive persistence normalization");
assert.equal(explainTruthProjection({
  scope: { relationId: "relation-a", characterId: "char-a", userIdentityId: "identity-a", conversationId: "conversation-a" },
  claims: claim ? [claim] : [],
  summaries: [],
  corrections: [],
  queryText: "海边",
}).at(0)?.reason, "paused");

const ui = readFileSync(new URL("../src/components/AppMemory.tsx", import.meta.url), "utf8");
for (const label of ["管理诊断", "来源应用", "召回诊断", "当前权重", "替代状态", "原始消息/记录", "暂停召回", "恢复召回", "导出记忆备份", "恢复记忆备份"]) {
  assert.match(ui, new RegExp(label), `memory management UI must expose ${label}`);
}
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(chat, /打开记忆诊断/);
assert.match(chat, /onNavigateToApp\("memory"\)/);
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
assert.match(app, /handleChatNavigateToApp/);
assert.match(app, /openDiagnosticsRequestId=\{memoryDiagnosticsRequestId\}/);

console.log("PASS memory diagnostics, recall pause/recover, provenance and backup controls");
