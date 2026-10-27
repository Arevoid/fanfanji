import assert from "node:assert/strict";
import { getLastTruthRetrievalDiagnostics, retrieveTruthForPrivatePrompt, formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const scope = { relationId: "relation-diagnostics", characterId: "char-diagnostics", userIdentityId: "identity-diagnostics", conversationId: "direct:diagnostics" };
const claim = (id: string, statement: string): KnowledgeClaim => ({
  ...scope,
  id,
  kind: "fact",
  subject: "relationship",
  statement,
  truthStatus: "confirmed",
  temporalStatus: "present",
  source: { kind: "user_message", authorship: "user", messageIds: [`message:${id}`], producer: "test", evidenceKey: id },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
});

const result = retrieveTruthForPrivatePrompt({
  scope,
  queryText: "打卡格式",
  limit: 1,
  claims: [claim("claim-hit", "每天打卡格式是亲亲老婆"), claim("claim-other", "用户喜欢看电影")],
  summaries: [],
  corrections: [],
});
assert.ok(result.diagnostics);
assert.equal(result.diagnostics?.candidateClaimCount, 2);
assert.deepEqual(result.diagnostics?.selectedClaimIds, ["claim-hit"]);
assert.deepEqual(result.diagnostics?.injectedClaimIds, []);
formatTruthRetrievalForPrompt(result);
assert.deepEqual(result.diagnostics?.injectedClaimIds, []);
assert.equal(result.diagnostics?.vectorFallbackUsed, false, "local retrieval must not claim that an embedding was used");
assert.deepEqual(getLastTruthRetrievalDiagnostics(scope)?.injectedClaimIds, ["claim-hit"]);

console.log("PASS production Truth retrieval diagnostics expose candidate, injected, and fallback counts");
