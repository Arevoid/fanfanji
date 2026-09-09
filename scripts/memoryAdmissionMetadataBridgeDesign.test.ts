import assert from "node:assert/strict";
import { buildMemoryCandidateIdempotencyKey, type MemoryCandidate } from "../src/domain/memory/memoryCandidate";
import { buildMemoryShadowCorrelationKey } from "../src/domain/memory/memoryShadowCorrelation";

/**
 * Design-only characterization. This local model is intentionally not imported
 * by production code: Stage 4D-10A must not implement the bridge yet.
 */
type DesignSemantic =
  | "objective_fact"
  | "asserted_fact"
  | "subjective_belief"
  | "uncertain_belief"
  | "hypothesis"
  | "stable_preference"
  | "temporary_preference"
  | "active_plan"
  | "cancelled_plan"
  | "uncertain_plan"
  | "completed_plan"
  | "event"
  | "episodic"
  | "scene_only"
  | "relationship_signal"
  | "unknown";

type Correlation = "exact" | "ambiguous" | "unmatched_legacy" | "unmatched_v2";
type LegacyDecision = "accepted" | "rejected" | "missing";
type BridgeState = "write" | "review" | "reject" | "route" | "legacy_passthrough" | "safety_veto";

interface DesignInput {
  semantic: DesignSemantic;
  correlation: Correlation;
  legacyDecision: LegacyDecision;
  v2Present: boolean;
  exactScope: boolean;
  trustedProvenance: boolean;
  explicitAuthorityConflict?: boolean;
}

interface DesignOutput {
  state: BridgeState;
  destination?: "event" | "episodic" | "relationship_review";
}

function designBridge(input: DesignInput): DesignOutput {
  if (!input.v2Present && input.legacyDecision === "accepted") return { state: "legacy_passthrough" };
  if (!input.exactScope || !input.trustedProvenance) return { state: "reject" };
  if (input.v2Present && input.correlation === "unmatched_v2") return { state: "review" };
  if (input.v2Present && input.correlation === "ambiguous") return { state: "review" };
  if (input.explicitAuthorityConflict && input.legacyDecision === "accepted") return { state: "safety_veto" };
  if (input.semantic === "objective_fact"
    && input.correlation === "exact"
    && input.legacyDecision === "accepted") return { state: "write" };
  if ((input.semantic === "subjective_belief"
      || input.semantic === "uncertain_belief"
      || input.semantic === "hypothesis")
    && input.correlation === "exact"
    && input.legacyDecision === "accepted") return { state: "legacy_passthrough" };
  if (input.semantic === "temporary_preference"
    || input.semantic === "cancelled_plan"
    || input.semantic === "completed_plan"
    || input.semantic === "scene_only"
    || input.semantic === "unknown") return { state: "reject" };
  if (input.semantic === "event") return { state: "route", destination: "event" };
  if (input.semantic === "episodic") return { state: "route", destination: "episodic" };
  if (input.semantic === "relationship_signal") return { state: "route", destination: "relationship_review" };
  return { state: "review" };
}

const baseInput: DesignInput = {
  semantic: "objective_fact",
  correlation: "exact",
  legacyDecision: "accepted",
  v2Present: true,
  exactScope: true,
  trustedProvenance: true,
};

assert.deepEqual(designBridge(baseInput), { state: "write" });
assert.deepEqual(designBridge({ ...baseInput, explicitAuthorityConflict: true }), { state: "safety_veto" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "subjective_belief" }), { state: "legacy_passthrough" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "hypothesis" }), { state: "legacy_passthrough" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "stable_preference" }), { state: "review" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "temporary_preference" }), { state: "reject" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "active_plan" }), { state: "review" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "cancelled_plan" }), { state: "reject" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "completed_plan" }), { state: "reject" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "event" }), { state: "route", destination: "event" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "episodic" }), { state: "route", destination: "episodic" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "scene_only" }), { state: "reject" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "relationship_signal" }), { state: "route", destination: "relationship_review" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "unknown" }), { state: "reject" });
assert.deepEqual(designBridge({ ...baseInput, correlation: "ambiguous" }), { state: "review" });
assert.deepEqual(designBridge({ ...baseInput, correlation: "unmatched_v2" }), { state: "review" });
assert.deepEqual(designBridge({ ...baseInput, v2Present: false }), { state: "legacy_passthrough" });
assert.deepEqual(designBridge({ ...baseInput, semantic: "objective_fact", legacyDecision: "rejected" }), { state: "review" });
assert.deepEqual(designBridge({ ...baseInput, exactScope: false }), { state: "reject" });
assert.deepEqual(designBridge({ ...baseInput, trustedProvenance: false }), { state: "reject" });

const candidate = (statement: string): MemoryCandidate => ({
  schemaVersion: 1,
  candidateId: "design-candidate",
  candidateKind: "fact",
  metadataSource: "v2",
  epistemicStatus: "objective",
  proposedAuthorityRole: "durable_candidate",
  resolvedAuthorityRole: "durable_candidate",
  statement,
  scope: { characterId: "character-1", relationId: "relation-1", userIdentityId: "identity-1", conversationId: "conversation-1" },
  provenance: {
    producer: "direct_chat",
    sourceType: "user_message",
    authorship: "user",
    sourceMessageIds: ["message-1"],
    conversationId: "conversation-1",
  },
  evidence: { sourceMessageIds: ["message-1"], evidenceKey: "message-1:fact" },
  temporal: { status: "present", recordedAt: 100 },
});

assert.equal(
  buildMemoryCandidateIdempotencyKey(candidate("第一种表述")),
  buildMemoryCandidateIdempotencyKey(candidate("第二种表述")),
  "idempotency identity must not depend on statement text",
);
assert.equal(
  buildMemoryShadowCorrelationKey(["message-1"], "present"),
  buildMemoryShadowCorrelationKey(["message-1"], "present"),
);
assert.notEqual(
  buildMemoryShadowCorrelationKey(["message-1"], "present"),
  buildMemoryShadowCorrelationKey(["message-1"], "future"),
  "temporal status remains part of source-window correlation",
);

console.log("PASS Stage 4D-10A design-only bridge matrix, safety-veto, correlation and idempotency contract");
