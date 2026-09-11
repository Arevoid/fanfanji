import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character, Message } from "../src/types";
import { observeDirectChatMemoryAdmissionShadow } from "../src/features/chat/services/directChatMemoryAdmissionShadow";
import {
  aggregateDirectChatMemoryAdmissionShadowEvidence,
  clearDirectChatMemoryAdmissionShadowEvidence,
  configureDirectChatMemoryAdmissionShadowEvidence,
  downloadDirectChatMemoryAdmissionShadowJson,
  exportDirectChatMemoryAdmissionShadowJson,
  getDirectChatMemoryAdmissionShadowEvidence,
  isDirectChatMemoryAdmissionShadowEvidenceEnabled,
  recordDirectChatMemoryAdmissionShadowEvidence,
} from "../src/features/chat/services/directChatMemoryAdmissionShadowTelemetry";

const character: Character = { id: "shadow-character", name: "角色", avatar: "", personality: "", backstory: "" };
const message: Message = {
  id: "shadow-message",
  characterId: character.id,
  relationId: "shadow-relation",
  conversationId: "shadow-conversation",
  sender: "user",
  content: "我周末喜欢喝咖啡。",
  timestamp: 100,
};
const secondMessage: Message = {
  ...message,
  id: "shadow-message-2",
  content: "我也喜欢散步。",
  timestamp: 101,
};
const scope = {
  characterId: character.id,
  relationId: "shadow-relation",
  userIdentityId: "shadow-user",
  conversationId: "shadow-conversation",
};
const extractionContext = {
  character,
  ...scope,
  recentMessages: [message, secondMessage],
  existingMemories: [],
  scenario: "chat" as const,
  apiKey: "secret-api-key",
  model: "model-a",
  createId: () => "shadow-memory",
  currentTime: () => 100,
  formatContent: (items: readonly string[]) => items.join(";"),
};
const candidate = (overrides: Record<string, unknown> = {}) => ({
  statement: "用户喜欢周末喝咖啡。",
  kind: "fact",
  subject: "user",
  temporalStatus: "present",
  sourceMessageIds: [message.id],
  evidenceQuote: "我周末喜欢喝咖啡",
  ...overrides,
});

configureDirectChatMemoryAdmissionShadowEvidence({ enabled: false, explicitDebug: true });
assert.equal(isDirectChatMemoryAdmissionShadowEvidenceEnabled(), false);
clearDirectChatMemoryAdmissionShadowEvidence();

let requestParams: { enableV2Shadow?: boolean; history?: readonly unknown[] } | undefined;
let providerCalls = 0;
const observedExtraction = await MemoryService.extractMemories({
  ...extractionContext,
  enableAdmissionShadowObservation: true,
}, async (params) => {
  providerCalls += 1;
  requestParams = params;
  return {
    items: [candidate(), candidate({ statement: "未出现在原文的候选。", sourceMessageIds: [secondMessage.id], evidenceQuote: "不存在的引用" })],
  };
});
assert.equal(requestParams?.enableV2Shadow, undefined, "admission evidence does not enable the V2 Prompt");
assert.equal(providerCalls, 1, "observation reuses the one existing extraction request");
assert.equal(observedExtraction.acceptedClaims.length, 1, "legacy authority still accepts only the verified candidate");
assert.equal(observedExtraction.shadowCandidatesV2?.length, 2, "the same parsed response supplies both shadow candidates");
assert.equal(observedExtraction.rejectedCandidates?.some((item) => item.decision === "accepted"), true);
assert.equal(observedExtraction.rejectedCandidates?.some((item) => item.decision === "rejected"), true);
assert.doesNotMatch(JSON.stringify(observedExtraction.rejectedCandidates), /shadow-message|用户喜欢喝咖啡|不存在的引用/u, "legacy diagnostics remain classification-only");
const normalExtraction = await MemoryService.extractMemories(extractionContext, async () => ({ items: [candidate()] }));
assert.equal(normalExtraction.rejectedCandidates, undefined, "observation diagnostics stay off by default");
assert.equal(normalExtraction.shadowCandidatesV2, undefined, "normal extraction does not allocate shadow candidates");

const shadow = observeDirectChatMemoryAdmissionShadow({
  extraction: observedExtraction,
  scope,
  createCandidateId: (() => {
    let index = 0;
    return () => `shadow-candidate-${++index}`;
  })(),
});
assert.equal(shadow.candidateCount, 2);
assert.equal(shadow.mismatchCounts.both_allow, 1);
assert.equal(shadow.mismatchCounts.old_reject_new_accept, 1, "per-candidate legacy rejection can be compared safely");
assert.equal(shadow.observations.some((item) => item.legacyReasonCode === "evidence_not_found"), true);
assert.equal(shadow.observations.some((item) => item.legacyDecision === "rejected" && item.v2State === "accepted"), true);

const missingConversation = observeDirectChatMemoryAdmissionShadow({
  extraction: observedExtraction,
  scope: { ...scope, conversationId: undefined },
  createCandidateId: () => "missing-conversation-candidate",
});
assert.equal(missingConversation.observations.every((item) => item.scopeExact === false), true, "Direct Chat shadow records missing conversation scope");
assert.equal(missingConversation.severityCounts.P0 >= 1, true, "missing exact scope is a P0 evidence finding");

configureDirectChatMemoryAdmissionShadowEvidence({ enabled: true, explicitDebug: true, maxObservations: 2 });
assert.equal(isDirectChatMemoryAdmissionShadowEvidenceEnabled(), true);
recordDirectChatMemoryAdmissionShadowEvidence({ scope, result: shadow, evidenceOrigin: "real_runtime" });
assert.equal(getDirectChatMemoryAdmissionShadowEvidence().length, 2, "buffer is bounded and retains the newest observations");
const exported = exportDirectChatMemoryAdmissionShadowJson();
assert.match(exported, /real_runtime/);
assert.doesNotMatch(exported, /shadow-message|shadow-character|shadow-relation|shadow-user|shadow-conversation/u, "scope and source IDs are not exported");
assert.doesNotMatch(exported, /用户喜欢周末喝咖啡|未出现在原文|我周末喜欢喝咖啡|secret-api-key|Authorization/u, "bodies, prompts and secrets are not exported");
assert.doesNotMatch(exported, /candidateId|idempotencyKey|sourceMessageIds|evidenceQuote/u, "raw candidate/source fields are not exported");
assert.equal(downloadDirectChatMemoryAdmissionShadowJson(), false, "Node/test runtime has no automatic file upload or browser download");

const records = getDirectChatMemoryAdmissionShadowEvidence();
const metrics = aggregateDirectChatMemoryAdmissionShadowEvidence(records);
assert.equal(metrics.totalObservations, 2);
assert.equal(metrics.comparable, 2);
assert.equal(metrics.legacyRejectedV2Accepted, 1);
assert.ok(metrics.severityCounts.P1 >= 1);

configureDirectChatMemoryAdmissionShadowEvidence({ enabled: true, explicitDebug: true, maxObservations: 4 });
recordDirectChatMemoryAdmissionShadowEvidence({ scope, result: shadow, evidenceOrigin: "synthetic" });
const mixed = JSON.parse(exportDirectChatMemoryAdmissionShadowJson()) as { evidenceOrigin: string };
assert.equal(mixed.evidenceOrigin, "mixed", "synthetic and real evidence stay distinguishable");
clearDirectChatMemoryAdmissionShadowEvidence();
assert.equal(getDirectChatMemoryAdmissionShadowEvidence().length, 0);

configureDirectChatMemoryAdmissionShadowEvidence({ enabled: true, explicitDebug: true, maxObservations: 2 });
const failedOpen = observeDirectChatMemoryAdmissionShadow({
  extraction: undefined as never,
  scope,
});
recordDirectChatMemoryAdmissionShadowEvidence({ scope, result: failedOpen, evidenceOrigin: "real_runtime" });
const failedMetrics = JSON.parse(exportDirectChatMemoryAdmissionShadowJson()) as { metrics: { failedOpenCount: number } };
assert.equal(failedMetrics.metrics.failedOpenCount, 1, "shadow evaluator exceptions are counted without retaining exception text");
clearDirectChatMemoryAdmissionShadowEvidence();

const hookSource = readFileSync(new URL("../src/features/chat/hooks/useChatMemoryExtraction.ts", import.meta.url), "utf8");
assert.match(hookSource, /recordDirectChatMemoryAdmissionShadowEvidence/u);
assert.match(hookSource, /observationPathEligible = isAutomaticDirectChat \|\| manualMessagesOverride === undefined/u);
assert.match(hookSource, /admissionShadowEnabled = observationPathEligible && isDirectChatMemoryAdmissionShadowEvidenceEnabled/u);
assert.doesNotMatch(hookSource, /localStorage|indexedDB|fetch\(/iu, "runtime observation has no persistence or network sink");
const telemetrySource = readFileSync(new URL("../src/features/chat/services/directChatMemoryAdmissionShadowTelemetry.ts", import.meta.url), "utf8");
assert.doesNotMatch(telemetrySource, /localStorage|indexedDB|fetch\(/iu);

console.log("PASS Stage 4D-2 real-runtime Admission shadow evidence, per-candidate diagnostics, privacy, buffer and metrics");
