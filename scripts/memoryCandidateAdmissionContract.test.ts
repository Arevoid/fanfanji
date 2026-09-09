import assert from "node:assert/strict";
import {
  buildMemoryCandidateIdempotencyKey,
  type MemoryCandidate,
} from "../src/domain/memory/memoryCandidate";
import {
  evaluateMemoryCandidate,
  MEMORY_PRODUCER_PERMISSIONS,
} from "../src/domain/memory/memoryAdmission";

const baseCandidate = (overrides: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  schemaVersion: 1,
  candidateId: "candidate-1",
  candidateKind: "fact",
  statement: "用户喜欢周末喝咖啡。",
  subject: "user",
  scope: {
    characterId: "character-1",
    relationId: "relation-1",
    userIdentityId: "identity-1",
    conversationId: "conversation-1",
  },
  provenance: {
    producer: "direct_chat",
    sourceType: "user_message",
    authorship: "user",
    app: "chat",
    sourceMessageIds: ["message-1"],
    conversationId: "conversation-1",
  },
  evidence: {
    sourceMessageIds: ["message-1"],
    evidenceKey: "message-1:coffee",
  },
  temporal: { status: "present", recordedAt: 100 },
  confidence: 0.8,
  importance: 6,
  lineage: {
    parentActionId: "action-1",
    producerActionId: "extract-1",
    sourceRequestId: "request-1",
  },
  ...overrides,
});

const acceptedFact = evaluateMemoryCandidate(baseCandidate());
assert.equal(acceptedFact.state, "accepted");
assert.equal(acceptedFact.target, "truth");
assert.equal(acceptedFact.reason, "accepted_fact");
assert.equal(acceptedFact.authority, "candidate_only", "AI/user-message intake never grants write authority");

const acceptedEvent = evaluateMemoryCandidate(baseCandidate({
  candidateId: "event-1",
  candidateKind: "event",
  statement: "双方去年在咖啡店见过面。",
  temporal: { status: "past", occurredAt: 50, recordedAt: 100 },
}));
assert.deepEqual(
  { state: acceptedEvent.state, target: acceptedEvent.target, reason: acceptedEvent.reason },
  { state: "accepted", target: "event", reason: "accepted_event" },
  "historical event is not a current scene",
);

const acceptedEpisodic = evaluateMemoryCandidate(baseCandidate({ candidateKind: "episodic" }));
assert.equal(acceptedEpisodic.target, "episodic");
assert.equal(acceptedEpisodic.authority, "candidate_only", "episodic material does not imply co-location or authority");

const acceptedPlan = evaluateMemoryCandidate(baseCandidate({
  candidateKind: "plan",
  temporal: { status: "future", recordedAt: 100 },
}));
assert.deepEqual(
  { state: acceptedPlan.state, target: acceptedPlan.target, reason: acceptedPlan.reason },
  { state: "accepted", target: "truth", reason: "accepted_plan" },
);

const acceptedBelief = evaluateMemoryCandidate(baseCandidate({ candidateKind: "belief" }));
assert.equal(acceptedBelief.target, "belief");
assert.notEqual(acceptedBelief.target, "event", "belief does not become a relationship event");

const manualFact = evaluateMemoryCandidate(baseCandidate({
  candidateId: "manual-1",
  provenance: {
    producer: "manual",
    sourceType: "manual",
    authorship: "user",
    app: "memory",
    sourceRecordIds: ["manual-record-1"],
  },
  evidence: { evidenceKey: "manual-record-1:confirmed" },
}));
assert.equal(manualFact.state, "accepted");
assert.equal(manualFact.authority, "manual_trusted");

assert.deepEqual(
  evaluateMemoryCandidate(baseCandidate({ candidateKind: "scene_only" })),
  {
    state: "rejected",
    reason: "scene_only",
    candidateId: "candidate-1",
    idempotencyKey: buildMemoryCandidateIdempotencyKey(baseCandidate({ candidateKind: "scene_only" })),
    authority: "candidate_only",
  },
  "scene-only text cannot enter canonical Truth directly",
);
assert.equal(
  evaluateMemoryCandidate(baseCandidate({
    candidateKind: "subjective_reflection",
    provenance: { ...baseCandidate().provenance, producer: "diary", sourceType: "feature_record" },
  })).reason,
  "subjective_reflection_not_truth",
);
assert.equal(
  evaluateMemoryCandidate(baseCandidate({ candidateKind: "relationship_signal" })).state,
  "needs_review",
  "relationship signals require review and cannot mutate RelationshipState",
);
assert.equal(
  evaluateMemoryCandidate(baseCandidate({ candidateKind: "unknown" })).reason,
  "unsupported_kind",
);

assert.equal(evaluateMemoryCandidate(baseCandidate({ scope: { ...baseCandidate().scope, relationId: "" } })).reason, "insufficient_scope");
assert.equal(
  evaluateMemoryCandidate(baseCandidate({
    provenance: { ...baseCandidate().provenance, conversationId: "other-conversation" },
  })).reason,
  "scope_mismatch",
);
assert.equal(
  evaluateMemoryCandidate(baseCandidate({
    provenance: { ...baseCandidate().provenance, sourceMessageIds: undefined },
    evidence: { evidenceKey: undefined },
  })).reason,
  "missing_provenance",
);
assert.equal(
  evaluateMemoryCandidate(baseCandidate({
    temporal: { status: "past", recordedAt: 100, validFrom: 200, validTo: 100 },
  })).reason,
  "invalid_temporal",
);

assert.equal(
  evaluateMemoryCandidate(baseCandidate({ candidateKind: "fact", provenance: { ...baseCandidate().provenance, producer: "diary" } })).reason,
  "producer_not_permitted",
);
assert.equal(
  evaluateMemoryCandidate(baseCandidate({ candidateKind: "fact", provenance: { ...baseCandidate().provenance, producer: "moments" } })).reason,
  "producer_not_permitted",
);
assert.equal(MEMORY_PRODUCER_PERMISSIONS.offline.requiresUserConfirmation, true);
assert.equal(MEMORY_PRODUCER_PERMISSIONS.reading.requiresUserConfirmation, true);
assert.equal(MEMORY_PRODUCER_PERMISSIONS.manual.canBeTrustedAuthority, true);
assert.equal(MEMORY_PRODUCER_PERMISSIONS.direct_chat.canBeTrustedAuthority, false);

const sameSourceDifferentCandidate = baseCandidate({ candidateId: "candidate-2", statement: "不同的候选文字。" });
assert.equal(
  buildMemoryCandidateIdempotencyKey(baseCandidate()),
  buildMemoryCandidateIdempotencyKey(sameSourceDifferentCandidate),
  "same source and kind are idempotent even if producer candidate text changes",
);
assert.notEqual(
  buildMemoryCandidateIdempotencyKey(baseCandidate()),
  buildMemoryCandidateIdempotencyKey(baseCandidate({ candidateKind: "event" })),
  "same source with different candidate kinds has distinct keys",
);
assert.notEqual(
  buildMemoryCandidateIdempotencyKey(baseCandidate()),
  buildMemoryCandidateIdempotencyKey(baseCandidate({ provenance: { ...baseCandidate().provenance, sourceMessageIds: ["message-2"] }, evidence: { sourceMessageIds: ["message-2"], evidenceKey: "message-2:coffee" } })),
  "different source references are not semantic duplicates",
);

const duplicateKey = buildMemoryCandidateIdempotencyKey(baseCandidate());
assert.equal(
  evaluateMemoryCandidate(baseCandidate(), { knownIdempotencyKeys: new Set([duplicateKey]) }).state,
  "duplicate",
);

const offlineScene = evaluateMemoryCandidate(baseCandidate({
  candidateKind: "scene_only",
  provenance: { ...baseCandidate().provenance, producer: "offline", sourceType: "offline_story", app: "offline" },
}));
assert.equal(offlineScene.reason, "scene_only", "offline scene text is not current online Scene");

const serializedContract = JSON.stringify(baseCandidate());
assert.equal(serializedContract.includes("Authorization"), false);
assert.equal(serializedContract.includes("apiKey"), false);
assert.equal(serializedContract.includes("system instruction"), false);
assert.equal(baseCandidate().lineage?.parentActionId, "action-1");
assert.equal(baseCandidate().lineage?.sourceRequestId, "request-1");

console.log("PASS MemoryCandidate provenance, scope, temporal, producer, idempotency, and admission contract characterization");
