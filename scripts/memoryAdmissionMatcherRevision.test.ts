import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import {
  getRuntimeExtractionLineage,
  parseKnowledgeExtractionOutputWithV2,
} from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { MemoryExtractionResult } from "../src/domain/memory/memoryTypes";
import type { MemoryCandidate } from "../src/domain/memory/memoryCandidate";
import {
  matchDirectChatMemoryCandidates,
  type DirectChatMemoryBridgeRuntimeContext,
  type DirectChatMemoryLegacyCandidate,
  type DirectChatMemoryV2Candidate,
} from "../src/features/chat/services/directChatMemoryAdmissionBridge";

const scope = {
  characterId: "matcher-character",
  relationId: "matcher-relation",
  userIdentityId: "matcher-user",
  conversationId: "matcher-conversation",
};
const runtime: DirectChatMemoryBridgeRuntimeContext = {
  scope,
  allowedSourceRefs: ["m1", "m2"],
  trustedProvenance: true,
};

function legacy(overrides: Partial<DirectChatMemoryLegacyCandidate> = {}): DirectChatMemoryLegacyCandidate {
  return {
    id: "legacy-1",
    diagnostic: { decision: "accepted", candidateKind: "fact", temporalStatus: "present", reason: "accepted" },
    candidateKind: "fact",
    temporalStatus: "present",
    sourceRefs: ["m1"],
    scope,
    provenanceTrusted: true,
    provenance: { producer: "memory-extractor.chat.v1", sourceType: "user_message", actorId: scope.userIdentityId, targetId: scope.characterId },
    policy: { epistemicStatus: "objective", durability: "unknown", planLifecycle: "unknown", resolvedAuthorityRole: "durable_candidate" },
    ...overrides,
  };
}

function candidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    schemaVersion: 1,
    candidateId: "v2-1",
    candidateKind: "fact",
    epistemicStatus: "objective",
    resolvedAuthorityRole: "durable_candidate",
    statement: "runtime candidate",
    scope,
    provenance: {
      producer: "direct_chat",
      sourceType: "user_message",
      authorship: "user",
      actorId: scope.userIdentityId,
      targetId: scope.characterId,
      sourceMessageIds: ["m1"],
    },
    evidence: { sourceMessageIds: ["m1"] },
    temporal: { status: "present", recordedAt: 1 },
    ...overrides,
  };
}

function v2(overrides: Partial<MemoryCandidate> = {}, decision: DirectChatMemoryV2Candidate["decision"] = {
  state: "accepted",
  reason: "accepted_fact",
  candidateId: "v2-1",
  idempotencyKey: "idempotency",
  authority: "candidate_only",
  target: "truth",
}): DirectChatMemoryV2Candidate {
  return { candidate: candidate(overrides), decision, runtime };
}

function matchOne(legacyCandidate: DirectChatMemoryLegacyCandidate, v2Candidate: DirectChatMemoryV2Candidate) {
  return matchDirectChatMemoryCandidates({ legacy: [legacyCandidate], v2: [v2Candidate], runtime });
}

// One raw Provider item produces both projections with one runtime lineage;
// different raw items receive different lineages even when their source set is
// identical. The lineage never appears in the JSON-facing candidate shape.
const parsed = parseKnowledgeExtractionOutputWithV2(JSON.stringify([
  {
    statement: "用户喜欢咖啡。",
    kind: "fact",
    subject: "user",
    temporalStatus: "present",
    sourceMessageIds: ["m1"],
    evidenceQuote: "喜欢咖啡",
    v2: { schemaVersion: 2, kind: "fact", epistemicStatus: "uncertain", authorityRole: "non_objective", actorRole: "user", targetRole: "character" },
  },
  {
    statement: "用户喜欢茶。",
    kind: "fact",
    subject: "user",
    temporalStatus: "present",
    sourceMessageIds: ["m1"],
    evidenceQuote: "喜欢茶",
    v2: { schemaVersion: 2, kind: "fact", epistemicStatus: "uncertain", authorityRole: "non_objective", actorRole: "user", targetRole: "character" },
  },
]), new Set(["m1"]));
assert.equal(parsed.candidates.length, 2);
assert.equal(parsed.structuredCandidatesV2.length, 2);
assert.ok(getRuntimeExtractionLineage(parsed.candidates[0]), "parser assigns an opaque lineage to each raw item");
assert.equal(
  getRuntimeExtractionLineage(parsed.candidates[0]),
  getRuntimeExtractionLineage(parsed.structuredCandidatesV2[0]),
  "legacy and V2 projections of one raw item share lineage",
);
assert.notEqual(
  getRuntimeExtractionLineage(parsed.candidates[0]),
  getRuntimeExtractionLineage(parsed.candidates[1]),
  "different raw items receive different lineage",
);

const extractionContext = {
  character: { id: scope.characterId, name: "角色", avatar: "", personality: "", backstory: "" },
  ...scope,
  recentMessages: [{ id: "m1", characterId: scope.characterId, relationId: scope.relationId, conversationId: scope.conversationId, sender: "user" as const, content: "我喜欢咖啡，也喜欢茶。", timestamp: 1 }],
  existingMemories: [],
  scenario: "chat" as const,
  apiKey: "test-only",
  model: "model",
  createId: () => "memory-id",
  currentTime: () => 1,
  formatContent: (items: readonly string[]) => items.join(";"),
  enableAdmissionShadowObservation: true,
};
const shaped = await MemoryService.extractMemories(extractionContext, async () => ({
  items: parsed.candidates,
  candidates: parsed.candidates,
  structuredCandidatesV2: parsed.structuredCandidatesV2,
}));
const shapedShadow = (await import("../src/features/chat/services/directChatMemoryAdmissionShadow")).observeDirectChatMemoryAdmissionShadow({
  extraction: shaped,
  scope,
  sourceEnvelope: shaped.sourceEnvelope,
  createCandidateId: (() => { let index = 0; return () => `candidate-${++index}`; })(),
  recordedAt: 1,
});
assert.equal(shapedShadow.bridgeShadow.metrics.exactCount, 2, "shared parsed-item lineage pairs both projections");
assert.equal(shapedShadow.bridgeShadow.metrics.unmatchedLegacyCount, 0);
assert.equal(shapedShadow.bridgeShadow.metrics.unmatchedV2Count, 0);
assert.equal(shaped.acceptedClaims.length, 2, "lineage is not written to legacy claims");
assert.equal(JSON.stringify(shaped.acceptedClaims).includes("runtimeLineageId"), false);
assert.equal(shapedShadow.bridgeShadow.pairCandidateMatrix.length, 4);

// Strict source subset compatibility is unique, scoped, trusted, semantic and
// producer-safe; it is marked identityExact=false for auditability.
const subset = matchOne(
  legacy({ sourceRefs: ["m1"] }),
  v2({ candidateId: "subset-v2", provenance: { ...candidate().provenance, sourceMessageIds: ["m1", "m2"] }, evidence: { sourceMessageIds: ["m1", "m2"] } }),
);
assert.equal(subset.matches[0]?.correlation, "exact");
assert.equal(subset.matches[0]?.identityExact, false);

// A lineage mismatch never falls back to a structural or text-based guess.
const lineageMismatch = matchOne(legacy({ runtimeLineageId: "lineage-a" }), v2({ runtimeLineageId: "lineage-b" }));
assert.equal(lineageMismatch.matches.some((item) => item.correlation === "exact"), false);
assert.equal(lineageMismatch.unmatchedLegacy.length, 1);
assert.equal(lineageMismatch.unmatchedV2.length, 1);

// A duplicated lineage token is ambiguous and cannot produce a write proposal.
const duplicateLineage = matchDirectChatMemoryCandidates({
  legacy: [legacy({ id: "legacy-a", runtimeLineageId: "same" }), legacy({ id: "legacy-b", runtimeLineageId: "same" })],
  v2: [v2({ candidateId: "v2-a", runtimeLineageId: "same" }), v2({ candidateId: "v2-b", runtimeLineageId: "same" })],
  runtime,
});
assert.equal(duplicateLineage.matches[0]?.correlation, "conflict");

// One-side unknown actor/target remains pairable by strict source identity and
// is surfaced as unknown in the matrix, never treated as explicit equality.
const actorUnknown = matchOne(
  legacy({ runtimeLineageId: undefined }),
  v2({ provenance: { ...candidate().provenance, actorId: undefined, targetId: undefined } }),
);
assert.equal(actorUnknown.matches[0]?.correlation, "exact");
assert.equal(actorUnknown.pairCandidateMatrix[0]?.sameActorTarget, "unknown");

// Producer aliases normalize, while temporal and scope differences remain
// hard boundaries even when source refs are the same.
const producerAlias = matchOne(legacy(), v2({ provenance: { ...candidate().provenance, producer: "direct-chat" as never } }));
assert.equal(producerAlias.matches[0]?.correlation, "exact");
const temporalMismatch = matchOne(legacy(), v2({ temporal: { status: "future", recordedAt: 1 } }));
assert.equal(temporalMismatch.matches.some((item) => item.correlation === "exact"), false);
const crossScope = matchDirectChatMemoryCandidates({
  legacy: [legacy({ runtimeLineageId: "cross" })],
  v2: [v2({ runtimeLineageId: "cross", scope: { ...scope, conversationId: "other" } })],
  runtime,
});
assert.equal(crossScope.matches.some((item) => item.correlation === "exact"), false);

console.log("PASS Stage 4D-10E parser lineage, constrained matcher tiers, pair matrix, ambiguity, scope, producer and temporal regression");
