import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { KnowledgeClaim, KnowledgeKind } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { buildMemoryCandidateIdempotencyKey } from "../src/domain/memory/memoryCandidate";
import type { MemoryExtractionResult } from "../src/domain/memory/memoryTypes";
import {
  adaptDirectChatMemoryExtractionToCandidates,
  type DirectChatMemoryCandidateAdapterInput,
} from "../src/features/chat/services/directChatMemoryCandidateAdapter";
import { observeDirectChatMemoryAdmissionShadow } from "../src/features/chat/services/directChatMemoryAdmissionShadow";

const scope = {
  characterId: "character-runtime",
  relationId: "relation-runtime",
  userIdentityId: "identity-runtime",
  conversationId: "conversation-runtime",
};

const claim = (kind: KnowledgeKind, overrides: Partial<KnowledgeClaim> = {}): KnowledgeClaim => ({
  id: `claim-${kind}`,
  characterId: "claim-character-must-not-win",
  relationId: "claim-relation-must-not-win",
  userIdentityId: "claim-identity-must-not-win",
  conversationId: "claim-conversation-must-not-win",
  kind,
  subject: "user",
  statement: `${kind}：用户喜欢周末喝咖啡。`,
  truthStatus: "asserted",
  temporalStatus: kind === "plan" ? "future" : "past",
  source: {
    kind: "user_message",
    authorship: "user",
    messageIds: ["message-1"],
    producer: "memory-extractor.chat.v1",
    evidenceKey: `message-1:${kind}`,
  },
  confidence: 0.85,
  importance: 5,
  userConfirmed: false,
  occurredAt: 90,
  recordedAt: 100,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
  ...overrides,
});

const extraction = (claims: KnowledgeClaim[], rejectedCandidateCount = 0): MemoryExtractionResult => ({
  extractedMemories: [],
  acceptedClaims: claims,
  rejectedCandidateCount,
});

let nextCandidateId = 0;
const input = (result: MemoryExtractionResult, overrides: Partial<DirectChatMemoryCandidateAdapterInput> = {}): DirectChatMemoryCandidateAdapterInput => ({
  extraction: result,
  scope,
  lineage: {
    parentActionId: "chat-action-1",
    producerActionId: "memory-extract-action-1",
    sourceRequestId: "ai-request-1",
  },
  createCandidateId: () => `candidate-${++nextCandidateId}`,
  ...overrides,
});

const mapped = adaptDirectChatMemoryExtractionToCandidates(input(extraction([
  claim("fact"),
  claim("plan", { id: "claim-plan", source: { ...claim("plan").source, messageIds: ["message-2"], evidenceKey: "message-2:plan" } }),
  claim("belief", { id: "claim-belief", subject: "character" }),
  claim("preference", { id: "claim-preference" }),
  claim("hypothesis", { id: "claim-hypothesis" }),
])));

assert.deepEqual(mapped.candidates.map((candidate) => candidate.candidateKind), ["fact", "plan", "belief", "unknown", "unknown"]);
assert.equal(mapped.candidates.length, 5, "one extraction result can produce N candidates");
assert.equal(new Set(mapped.candidates.map((candidate) => candidate.candidateId)).size, 5);
assert.equal(mapped.unsupportedKindCount, 2, "preference/hypothesis are not silently relabeled as fact or belief");
assert.equal(mapped.sceneClassificationUnavailableCount, 5, "old extraction has no scene classification field");
assert.deepEqual(mapped.candidates[0]?.scope, scope, "scope comes from canonical runtime, not claim fields");
assert.deepEqual(mapped.candidates[0]?.provenance.sourceMessageIds, ["message-1"]);
assert.equal(mapped.candidates[0]?.provenance.conversationId, scope.conversationId);
assert.equal(mapped.candidates[0]?.provenance.actorId, scope.userIdentityId);
assert.equal(mapped.candidates[0]?.provenance.targetId, scope.characterId);
assert.equal(mapped.candidates[0]?.temporal.status, "past");
assert.equal(mapped.candidates[1]?.temporal.status, "future");
assert.equal(mapped.candidates[1]?.lineage?.parentActionId, "chat-action-1");
assert.equal(mapped.candidates[1]?.lineage?.sourceRequestId, "ai-request-1");

const repeated = adaptDirectChatMemoryExtractionToCandidates(input(extraction([claim("fact")])));
assert.equal(
  buildMemoryCandidateIdempotencyKey(mapped.candidates[0]!),
  buildMemoryCandidateIdempotencyKey(repeated.candidates[0]!),
  "repeating the same extraction keeps the source-level key stable",
);
assert.notEqual(mapped.candidates[0]?.candidateId, repeated.candidates[0]?.candidateId, "candidate instances may have different governed IDs");
const sameSourceDifferentKind = adaptDirectChatMemoryExtractionToCandidates(input(extraction([
  claim("fact", { id: "fact-again" }),
  claim("plan", { id: "plan-again" }),
])));
assert.notEqual(
  buildMemoryCandidateIdempotencyKey(sameSourceDifferentKind.candidates[0]!),
  buildMemoryCandidateIdempotencyKey(sameSourceDifferentKind.candidates[1]!),
  "same source with different kinds has different deterministic keys",
);

const missingSourceClaim = claim("fact", {
  id: "claim-without-source-ids",
  source: { ...claim("fact").source, messageIds: undefined },
});
const missingSource = observeDirectChatMemoryAdmissionShadow(input(extraction([missingSourceClaim])));
assert.equal(missingSource.missingProvenanceCount, 1);
assert.equal(missingSource.decisionCounts.rejected, 1);
assert.equal(missingSource.rejectedByReason.missing_provenance, 1);

const missingScope = observeDirectChatMemoryAdmissionShadow(input(extraction([claim("fact")]), {
  scope: { characterId: scope.characterId, relationId: undefined, userIdentityId: scope.userIdentityId, conversationId: scope.conversationId },
}));
assert.equal(missingScope.missingScopeCount, 1);
assert.equal(missingScope.rejectedByReason.insufficient_scope, 1);

const compared = observeDirectChatMemoryAdmissionShadow(input(extraction([
  claim("fact", { source: { ...claim("fact").source, messageIds: ["message-1"], evidenceKey: "message-1:fact" } }),
  claim("belief", { source: { ...claim("belief").source, messageIds: ["message-2"], evidenceKey: "message-2:belief" } }),
  claim("preference", { id: "old-preference", source: { ...claim("preference").source, messageIds: ["message-3"], evidenceKey: "message-3:preference" } }),
  claim("hypothesis", { id: "old-hypothesis", source: { ...claim("hypothesis").source, messageIds: ["message-4"], evidenceKey: "message-4:hypothesis" } }),
], 2)));
assert.equal(compared.candidateCount, 4);
assert.equal(compared.decisionCounts.accepted, 2);
assert.equal(compared.decisionCounts.rejected, 2);
assert.equal(compared.acceptedByTarget.truth, 1);
assert.equal(compared.acceptedByTarget.belief, 1);
assert.equal(compared.mismatchCounts.both_allow, 2);
assert.equal(compared.mismatchCounts.old_allow_new_reject, 2, "old Knowledge gate vs new intake gap is visible, not auto-fixed");
assert.equal(compared.mismatchCounts.incomparable, 2, "aggregate legacy rejected count remains incomparable when no per-candidate diagnostics exist");
assert.equal(compared.observations[0]?.sourceMessageCount, 1);
assert.equal(JSON.stringify(compared).includes("用户喜欢周末喝咖啡"), false, "shadow diagnostics do not retain statement bodies");

const ambiguous = observeDirectChatMemoryAdmissionShadow(input(extraction([
  claim("fact", { id: "ambiguous-fact" }),
  claim("belief", { id: "ambiguous-belief" }),
])));
assert.equal(ambiguous.mismatchCounts.both_allow, 0, "duplicate source correlation never falls back to array position");
assert.equal(ambiguous.mismatchCounts.incomparable >= 2, true, "ambiguous source matches remain incomparable");

const firstKey = compared.observations[0]?.idempotencyKey;
assert.ok(firstKey);
const duplicate = observeDirectChatMemoryAdmissionShadow(input(extraction([claim("fact")]), {
  knownIdempotencyKeys: new Set([firstKey]),
}));
assert.equal(duplicate.decisionCounts.duplicate, 1);
assert.equal(duplicate.duplicateCount, 1);

const failedOpen = observeDirectChatMemoryAdmissionShadow({
  extraction: undefined as unknown as MemoryExtractionResult,
  scope,
});
assert.equal(failedOpen.failedOpen, true, "shadow failure must not throw into production flow");
assert.equal(failedOpen.candidateCount, 0);

const adapterSource = readFileSync(new URL("../src/features/chat/services/directChatMemoryCandidateAdapter.ts", import.meta.url), "utf8");
const shadowSource = readFileSync(new URL("../src/features/chat/services/directChatMemoryAdmissionShadow.ts", import.meta.url), "utf8");
assert.doesNotMatch(adapterSource, /apiChat|apiExtract|localStorage|indexedDB|MemoryWriteCoordinator|PromptComposer|Repository/iu);
assert.doesNotMatch(shadowSource, /apiChat|apiExtract|localStorage|indexedDB|MemoryWriteCoordinator|PromptComposer|Repository/iu);
const hookSource = readFileSync(new URL("../src/features/chat/hooks/useChatMemoryExtraction.ts", import.meta.url), "utf8");
assert.match(hookSource, /observeDirectChatMemoryAdmissionShadow/u, "normal Direct Chat has a metadata-only observation seam");
assert.match(hookSource, /isDirectChatMemoryAdmissionShadowEvidenceEnabled/u, "observation remains explicitly gated");
assert.match(hookSource, /enableAdmissionShadowObservation/u, "shadow candidates are derived without enabling the V2 Prompt");

console.log("PASS Direct Chat memory candidate adapter, shadow admission, mismatch and fail-open characterization");
