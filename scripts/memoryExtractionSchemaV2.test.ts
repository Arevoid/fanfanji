import assert from "node:assert/strict";
import {
  parseKnowledgeExtractionOutput,
  parseMemoryExtractionCandidateV2Output,
} from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import { evaluateMemoryCandidate } from "../src/domain/memory/memoryAdmission";
import type { MemoryExtractionResult } from "../src/domain/memory/memoryTypes";
import {
  adaptDirectChatMemoryExtractionToCandidates,
} from "../src/features/chat/services/directChatMemoryCandidateAdapter";

const allowedMessageIds = new Set(["message-user", "message-character"]);
const v2Payload = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  kind: "fact",
  semanticFacet: "preference",
  durability: "stable",
  statement: "用户喜欢周末喝咖啡。",
  temporalStatus: "present",
  sourceMessageIds: ["message-user"],
  evidenceQuote: "我周末喜欢喝咖啡。",
  confidence: 0.9,
  importance: 6,
  actorRole: "user",
  targetRole: "character",
  ...overrides,
});

const parsed = parseMemoryExtractionCandidateV2Output([
  v2Payload(),
  v2Payload({ kind: "belief", semanticFacet: "hypothesis", statement: "角色认为用户可能会来。", actorRole: "character", targetRole: "user" }),
  v2Payload({ kind: "event", semanticFacet: undefined, statement: "双方去年在海边见过面。", temporalStatus: "past", occurredAt: 10 }),
  v2Payload({ kind: "episodic", semanticFacet: undefined, statement: "双方共同经历了那场演出。" }),
  v2Payload({ kind: "relationship_signal", semanticFacet: "relationship_signal", relationshipSignalKind: "promise", statement: "双方作出了共同承诺。", actorRole: "user", targetRole: "character" }),
  v2Payload({ kind: "scene_only", semanticFacet: "scene_only", durability: "temporary", statement: "双方此刻坐在客厅。" }),
  v2Payload({ kind: "subjective_reflection", semanticFacet: "subjective_reflection", statement: "角色对这段关系有复杂感受。" }),
  v2Payload({ kind: "fact", semanticFacet: "unknown_future_facet", statement: "未知语义不会获得权威。", ignoredField: "not part of the contract" }),
  v2Payload({ sourceMessageIds: ["foreign-message"], statement: "外部消息不可引用。" }),
].map((item) => JSON.stringify(item)).join("\n"), allowedMessageIds);

assert.equal(parsed.length, 8, "foreign source references are rejected without dropping valid V2 candidates");
assert.equal(parsed[0]?.semanticFacet, "preference");
assert.equal(parsed[0]?.durability, "stable");
assert.equal(parsed[1]?.kind, "belief");
assert.equal(parsed[1]?.semanticFacet, "hypothesis");
assert.equal(parsed[2]?.occurredAt, 10);
assert.equal(parsed[4]?.relationshipSignalKind, "promise");
assert.equal(parsed[5]?.kind, "scene_only");
assert.equal(parsed[6]?.kind, "subjective_reflection");
assert.equal(parsed[7]?.kind, "unknown", "unknown semantic facets fail safe to an unsupported kind");
assert.equal(parsed[7]?.semanticFacet, undefined);
assert.equal("ignoredField" in (parsed[0] || {}), false, "unknown fields are ignored");

const legacy = parseKnowledgeExtractionOutput(JSON.stringify({
  statement: "用户计划明天去散步。",
  kind: "plan",
  subject: "user",
  temporalStatus: "future",
  sourceMessageIds: ["message-user"],
  evidenceQuote: "明天去散步。",
}), allowedMessageIds);
assert.equal(legacy.length, 1, "legacy extraction output remains parseable");
assert.equal(legacy[0]?.kind, "plan");

const extraction: MemoryExtractionResult = {
  extractedMemories: [],
  acceptedClaims: [],
  rejectedCandidateCount: 0,
  structuredCandidatesV2: parsed,
};
const adapted = adaptDirectChatMemoryExtractionToCandidates({
  extraction,
  scope: {
    characterId: "character-runtime",
    relationId: "relation-runtime",
    userIdentityId: "identity-runtime",
    conversationId: "conversation-runtime",
  },
  recordedAt: 100,
  createCandidateId: (() => {
    let index = 0;
    return () => `v2-candidate-${++index}`;
  })(),
  lineage: { parentActionId: "chat-action-v2" },
});
assert.equal(adapted.candidates.length, 8);
assert.equal(adapted.sceneClassificationUnavailableCount, 0, "V2 carries explicit scene-capable classification");
assert.equal(adapted.candidates[0]?.semanticFacet, "preference");
assert.equal(adapted.candidates[0]?.durability, "stable");
assert.equal(adapted.candidates[0]?.provenance.authorship, "unknown");
assert.equal(adapted.candidates[0]?.provenance.actorId, "identity-runtime");
assert.equal(adapted.candidates[0]?.provenance.targetId, "character-runtime");
assert.equal(adapted.candidates[4]?.relationshipSignalKind, "promise");
assert.equal(adapted.candidates[0]?.temporal.recordedAt, 100);
assert.equal(JSON.stringify(adapted).includes("我周末喜欢喝咖啡"), false, "adapter does not persist evidence quote bodies");

const stablePreference = evaluateMemoryCandidate(adapted.candidates[0]!);
assert.deepEqual(
  { state: stablePreference.state, target: stablePreference.target, reason: stablePreference.reason },
  { state: "accepted", target: "truth", reason: "accepted_fact" },
);
const temporaryPreference = evaluateMemoryCandidate({
  ...adapted.candidates[0]!,
  candidateId: "temporary-preference",
  durability: "temporary",
});
assert.equal(temporaryPreference.state, "needs_review");
assert.equal(temporaryPreference.reason, "temporary_preference_requires_review");
const unknownHypothesis = evaluateMemoryCandidate({
  ...adapted.candidates[1]!,
  candidateId: "unknown-hypothesis",
  provenance: { ...adapted.candidates[1]!.provenance, actorId: undefined, targetId: undefined },
});
assert.equal(unknownHypothesis.state, "needs_review");
assert.equal(unknownHypothesis.reason, "hypothesis_missing_subject");

console.log("PASS Memory extraction schema V2 normalization, legacy compatibility, adapter mapping, and admission semantics");
