import type { KnowledgeClaim, TemporalStatus, TruthStatus } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { MemoryAdmissionDecision } from "../../../domain/memory/memoryAdmission";
import type {
  MemoryCandidate,
  MemoryCandidateAuthorityRole,
  MemoryCandidateDurability,
  MemoryCandidateEpistemicStatus,
  MemoryCandidateKind,
  MemoryCandidatePlanLifecycle,
  MemoryCandidateSourceType,
} from "../../../domain/memory/memoryCandidate";
import { buildMemoryCandidateIdempotencyKey } from "../../../domain/memory/memoryCandidate";
import { buildMemoryShadowCorrelationKey } from "../../../domain/memory/memoryShadowCorrelation";
import type { MemoryExtractionCandidateDecision, MemoryExtractionRejectionDiagnostic } from "../../../domain/memory/memoryExtractionSchema";
import type { MemoryAdmissionComparisonSemanticKind } from "./directChatMemoryAdmissionComparison";

export type DirectChatMemoryCorrelationState =
  | "exact"
  | "ambiguous"
  | "unmatched_legacy"
  | "unmatched_v2"
  | "legacy_only"
  | "v2_only"
  | "duplicate"
  | "conflict";

export type DirectChatMemoryBridgeState =
  | "legacy_passthrough"
  | "write_proposal"
  | "review"
  | "reject"
  | "route"
  | "safety_veto";

export type DirectChatMemoryBridgeReason =
  | "legacy_only"
  | "unmatched_legacy"
  | "v2_only_not_write_enabled"
  | "exact_objective_candidate"
  | "cautious_belief_passthrough"
  | "uncertain_belief_review"
  | "stable_preference_review"
  | "temporary_preference_not_durable"
  | "unknown_preference_durability"
  | "active_plan_review"
  | "cancelled_plan_not_active"
  | "uncertain_plan_review"
  | "completed_plan_not_active"
  | "event_route"
  | "episodic_review_or_route"
  | "scene_only_not_truth"
  | "relationship_signal_review"
  | "unknown_semantics"
  | "ambiguous_correlation"
  | "scope_mismatch"
  | "provenance_mismatch"
  | "authority_conflict"
  | "conflicting_duplicate"
  | "duplicate_same_intent"
  | "old_reject_new_accept"
  | "v2_candidate_not_accepted"
  | "missing_runtime_binding";

export interface DirectChatMemoryBridgeScope {
  characterId: string;
  relationId: string;
  userIdentityId: string;
  conversationId: string;
}

export interface DirectChatMemoryBridgeRuntimeContext {
  scope: DirectChatMemoryBridgeScope;
  /** Source references are runtime-owned and never model-authored. */
  allowedSourceRefs: readonly string[];
  trustedProvenance: boolean;
}

export interface DirectChatMemoryBridgePolicyDimensions {
  epistemicStatus: MemoryCandidateEpistemicStatus;
  durability: MemoryCandidateDurability;
  planLifecycle: MemoryCandidatePlanLifecycle;
  resolvedAuthorityRole: MemoryCandidateAuthorityRole;
}

export interface DirectChatMemoryLegacyCandidate {
  id: string;
  diagnostic: Pick<MemoryExtractionRejectionDiagnostic, "decision" | "candidateKind" | "temporalStatus" | "correlationKey" | "reason">;
  claim?: KnowledgeClaim;
  candidateKind?: MemoryAdmissionComparisonSemanticKind;
  truthStatus?: TruthStatus;
  temporalStatus: TemporalStatus;
  sourceRefs: readonly string[];
  scope: DirectChatMemoryBridgeScope;
  provenanceTrusted: boolean;
  provenance: {
    producer: string;
    sourceType: MemoryCandidateSourceType | "import";
    actorId?: string;
    targetId?: string;
    evidenceKey?: string;
  };
  policy: DirectChatMemoryBridgePolicyDimensions;
}

export interface DirectChatMemoryV2Candidate {
  candidate: MemoryCandidate;
  decision: MemoryAdmissionDecision;
  runtime: DirectChatMemoryBridgeRuntimeContext;
}

export interface DirectChatMemoryIdentityDimensions {
  scope: DirectChatMemoryBridgeScope;
  sourceRefs: readonly string[];
  semanticKind: MemoryAdmissionComparisonSemanticKind;
  actorId?: string;
  targetId?: string;
  temporalStatus: TemporalStatus;
  producer: string;
  sourceType: string;
  evidenceKey?: string;
}

export interface DirectChatMemoryPolicyConflict {
  fields: readonly (keyof DirectChatMemoryBridgePolicyDimensions)[];
  unsafe: boolean;
}

export interface DirectChatMemoryMatch {
  correlation: DirectChatMemoryCorrelationState;
  identityExact: boolean;
  sourceWindowKey?: string;
  identityKey?: string;
  legacy: readonly DirectChatMemoryLegacyCandidate[];
  v2: readonly DirectChatMemoryV2Candidate[];
  policyConflict?: DirectChatMemoryPolicyConflict;
  reason?: Extract<DirectChatMemoryBridgeReason, "ambiguous_correlation" | "scope_mismatch" | "provenance_mismatch" | "conflicting_duplicate">;
}

export interface DirectChatMemoryMatcherResult {
  matches: readonly DirectChatMemoryMatch[];
  unmatchedLegacy: readonly DirectChatMemoryLegacyCandidate[];
  unmatchedV2: readonly DirectChatMemoryV2Candidate[];
}

export interface DirectChatMemoryWriteProposal {
  legacyCandidateId: string;
  v2CandidateId: string;
  idempotencyKey: string;
  semanticKind: MemoryAdmissionComparisonSemanticKind;
  sourceRefs: readonly string[];
  authority: "candidate_only";
}

export type DirectChatMemoryBridgeDecision =
  | { state: "legacy_passthrough"; reason: DirectChatMemoryBridgeReason; correlation: DirectChatMemoryCorrelationState }
  | { state: "write_proposal"; reason: "exact_objective_candidate"; correlation: "exact" | "duplicate"; proposal: DirectChatMemoryWriteProposal }
  | { state: "review"; reason: DirectChatMemoryBridgeReason; correlation: DirectChatMemoryCorrelationState }
  | { state: "reject"; reason: DirectChatMemoryBridgeReason; correlation: DirectChatMemoryCorrelationState }
  | { state: "route"; reason: "event_route" | "episodic_review_or_route" | "relationship_signal_review"; correlation: DirectChatMemoryCorrelationState; destination: "event" | "episodic" | "relationship_review" }
  | { state: "safety_veto"; reason: "authority_conflict" | "conflicting_duplicate" | "temporary_preference_not_durable" | "cancelled_plan_not_active" | "completed_plan_not_active" | "scene_only_not_truth" | "relationship_signal_review"; correlation: DirectChatMemoryCorrelationState };

const UNKNOWN = "unknown" as const;

const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const normalizeRefs = (values: readonly string[]): string[] => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();

const sameStringArray = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

function sameScope(left: Partial<DirectChatMemoryBridgeScope>, right: DirectChatMemoryBridgeScope): boolean {
  const values = [left.characterId, left.relationId, left.userIdentityId, left.conversationId];
  return values.every((value) => Boolean(normalize(value)))
    && normalize(left.characterId) === normalize(right.characterId)
    && normalize(left.relationId) === normalize(right.relationId)
    && normalize(left.userIdentityId) === normalize(right.userIdentityId)
    && normalize(left.conversationId) === normalize(right.conversationId);
}

function effectiveSemanticKind(candidate: MemoryCandidate): MemoryAdmissionComparisonSemanticKind {
  if (candidate.semanticFacet === "preference") return "preference";
  if (candidate.semanticFacet === "hypothesis") return "hypothesis";
  return candidate.candidateKind;
}

function legacySemanticKind(candidate: DirectChatMemoryLegacyCandidate): MemoryAdmissionComparisonSemanticKind {
  if (candidate.claim?.kind === "preference") return "preference";
  if (candidate.claim?.kind === "hypothesis") return "hypothesis";
  if (candidate.candidateKind) return candidate.candidateKind;
  if (candidate.diagnostic.candidateKind) return candidate.diagnostic.candidateKind;
  return "unknown";
}

function trustedCandidate(candidate: DirectChatMemoryV2Candidate): boolean {
  const runtimeRefs = new Set(normalizeRefs(candidate.runtime.allowedSourceRefs));
  const candidateRefs = normalizeRefs([
    ...(candidate.candidate.provenance.sourceMessageIds || []),
    ...(candidate.candidate.provenance.sourceEventIds || []),
    ...(candidate.candidate.provenance.sourceRecordIds || []),
    ...(candidate.candidate.evidence.sourceMessageIds || []),
    ...(candidate.candidate.evidence.sourceEventIds || []),
    ...(candidate.candidate.evidence.sourceRecordIds || []),
  ]);
  return candidate.runtime.trustedProvenance
    && candidateRefs.length > 0
    && sameScope(candidate.candidate.scope, candidate.runtime.scope)
    && candidateRefs.every((ref) => runtimeRefs.has(ref));
}

function normalizeProducer(value: string): string {
  return value.startsWith("memory-extractor.chat") ? "direct_chat" : value;
}

function legacyActorTarget(candidate: DirectChatMemoryLegacyCandidate): { actorId?: string; targetId?: string } {
  if (candidate.provenance.actorId || candidate.provenance.targetId) {
    return {
      ...(normalize(candidate.provenance.actorId) ? { actorId: normalize(candidate.provenance.actorId) } : {}),
      ...(normalize(candidate.provenance.targetId) ? { targetId: normalize(candidate.provenance.targetId) } : {}),
    };
  }
  if (candidate.claim?.subject === "user") return { actorId: candidate.scope.userIdentityId, targetId: candidate.scope.characterId };
  if (candidate.claim?.subject === "character") return { actorId: candidate.scope.characterId, targetId: candidate.scope.userIdentityId };
  return {};
}

function identityForLegacy(candidate: DirectChatMemoryLegacyCandidate): DirectChatMemoryIdentityDimensions {
  const actorTarget = legacyActorTarget(candidate);
  return {
    scope: candidate.scope,
    sourceRefs: normalizeRefs(candidate.sourceRefs),
    semanticKind: legacySemanticKind(candidate),
    ...(normalize(actorTarget.actorId) ? { actorId: normalize(actorTarget.actorId) } : {}),
    ...(normalize(actorTarget.targetId) ? { targetId: normalize(actorTarget.targetId) } : {}),
    temporalStatus: candidate.temporalStatus,
    producer: normalizeProducer(candidate.provenance.producer),
    sourceType: candidate.provenance.sourceType,
  };
}

function identityForV2(candidate: DirectChatMemoryV2Candidate): DirectChatMemoryIdentityDimensions {
  const value = candidate.candidate;
  return {
    scope: value.scope as DirectChatMemoryBridgeScope,
    sourceRefs: normalizeRefs([
      ...(value.provenance.sourceMessageIds || []),
      ...(value.provenance.sourceEventIds || []),
      ...(value.provenance.sourceRecordIds || []),
      ...(value.evidence.sourceMessageIds || []),
      ...(value.evidence.sourceEventIds || []),
      ...(value.evidence.sourceRecordIds || []),
    ]),
    semanticKind: effectiveSemanticKind(value),
    ...(normalize(value.provenance.actorId) ? { actorId: normalize(value.provenance.actorId) } : {}),
    ...(normalize(value.provenance.targetId) ? { targetId: normalize(value.provenance.targetId) } : {}),
    temporalStatus: value.temporal.status,
    producer: value.provenance.producer,
    sourceType: value.provenance.sourceType,
  };
}

function identityKey(identity: DirectChatMemoryIdentityDimensions): string {
  return JSON.stringify({
    scope: identity.scope,
    sourceRefs: normalizeRefs(identity.sourceRefs),
    semanticKind: identity.semanticKind,
    actorId: identity.actorId || "",
    targetId: identity.targetId || "",
    temporalStatus: identity.temporalStatus,
    producer: identity.producer,
    sourceType: identity.sourceType,
  });
}

function sourceWindowKey(identity: DirectChatMemoryIdentityDimensions): string | undefined {
  return buildMemoryShadowCorrelationKey(identity.sourceRefs, identity.temporalStatus);
}

function authorityOnlySemanticDivergence(
  legacy: DirectChatMemoryLegacyCandidate,
  v2: DirectChatMemoryV2Candidate,
): boolean {
  const legacyKind = legacySemanticKind(legacy);
  const v2Kind = effectiveSemanticKind(v2.candidate);
  const nonObjectiveKind = new Set<MemoryAdmissionComparisonSemanticKind>([
    "belief", "hypothesis", "subjective_reflection", "scene_only", "relationship_signal",
  ]);
  return (legacyKind === "fact" && nonObjectiveKind.has(v2Kind))
    || (v2Kind === "fact" && nonObjectiveKind.has(legacyKind));
}

function policyKey(policy: DirectChatMemoryBridgePolicyDimensions): string {
  return JSON.stringify(policy);
}

function policyConflict(
  legacy: DirectChatMemoryLegacyCandidate,
  v2: DirectChatMemoryV2Candidate,
): DirectChatMemoryPolicyConflict | undefined {
  const left = legacy.policy;
  const right: DirectChatMemoryBridgePolicyDimensions = {
    epistemicStatus: v2.candidate.epistemicStatus || UNKNOWN,
    durability: v2.candidate.durability || UNKNOWN,
    planLifecycle: v2.candidate.planLifecycle || UNKNOWN,
    resolvedAuthorityRole: v2.candidate.resolvedAuthorityRole || UNKNOWN,
  };
  const fields = (Object.keys(left) as (keyof DirectChatMemoryBridgePolicyDimensions)[]).filter((field) => {
    const leftValue = left[field];
    const rightValue = right[field];
    return leftValue !== UNKNOWN && rightValue !== UNKNOWN && leftValue !== rightValue;
  });
  if (fields.length === 0) return undefined;
  const unsafe = (left.resolvedAuthorityRole === "durable_candidate"
    && (right.resolvedAuthorityRole === "non_objective" || right.resolvedAuthorityRole === "scene_only" || right.resolvedAuthorityRole === "relationship_signal" || right.resolvedAuthorityRole === "transient"))
    || (left.planLifecycle === "active" && (right.planLifecycle === "cancelled" || right.planLifecycle === "completed"))
    || (left.durability === "stable" && right.durability === "temporary");
  return { fields, unsafe };
}

function matchGroup(
  legacy: readonly DirectChatMemoryLegacyCandidate[],
  v2: readonly DirectChatMemoryV2Candidate[],
  sourceKey: string | undefined,
  key: string | undefined,
): DirectChatMemoryMatch {
  if (legacy.length === 0) return { correlation: v2.length > 0 ? "unmatched_v2" : "v2_only", identityExact: false, sourceWindowKey: sourceKey, identityKey: key, legacy, v2 };
  if (v2.length === 0) return { correlation: "unmatched_legacy", identityExact: false, sourceWindowKey: sourceKey, identityKey: key, legacy, v2 };
  if (!sourceKey) return { correlation: "ambiguous", identityExact: false, sourceWindowKey: sourceKey, identityKey: key, legacy, v2, reason: "ambiguous_correlation" };
  if (legacy.length === 1 && v2.length === 1) {
    const conflict = policyConflict(legacy[0]!, v2[0]!);
    return {
      correlation: conflict ? "conflict" : "exact",
      identityExact: true,
      sourceWindowKey: sourceKey,
      identityKey: key,
      legacy,
      v2,
      ...(conflict ? { policyConflict: conflict } : {}),
    };
  }
  const allPolicies = [
    ...legacy.map((item) => policyKey(item.policy)),
    ...v2.map((item) => policyKey({
      epistemicStatus: item.candidate.epistemicStatus || UNKNOWN,
      durability: item.candidate.durability || UNKNOWN,
      planLifecycle: item.candidate.planLifecycle || UNKNOWN,
      resolvedAuthorityRole: item.candidate.resolvedAuthorityRole || UNKNOWN,
    })),
  ];
  if (new Set(allPolicies).size === 1) return { correlation: "duplicate", identityExact: true, sourceWindowKey: sourceKey, identityKey: key, legacy, v2 };
  const correlation: DirectChatMemoryCorrelationState = legacy.length > 1 && v2.length > 1 ? "conflict" : "ambiguous";
  return {
    correlation,
    identityExact: true,
    sourceWindowKey: sourceKey,
    identityKey: key,
    legacy,
    v2,
    reason: correlation === "conflict" ? "conflicting_duplicate" : "ambiguous_correlation",
  };
}

/**
 * Pure two-stage matcher. Policy dimensions are intentionally excluded from
 * identityKey, so objective/subjective and lifecycle conflicts remain paired.
 */
export function matchDirectChatMemoryCandidates(input: {
  legacy: readonly DirectChatMemoryLegacyCandidate[];
  v2: readonly DirectChatMemoryV2Candidate[];
  runtime: DirectChatMemoryBridgeRuntimeContext;
}): DirectChatMemoryMatcherResult {
  const legacyIndexes = input.legacy.map((candidate) => ({
    candidate,
    identity: identityForLegacy(candidate),
    validScope: sameScope(candidate.scope, input.runtime.scope),
    validProvenance: candidate.provenanceTrusted,
  }));
  const v2Indexes = input.v2.map((candidate) => ({
    candidate,
    identity: identityForV2(candidate),
    validScope: sameScope(candidate.candidate.scope, input.runtime.scope),
    validProvenance: trustedCandidate(candidate),
  }));
  const legacyByKey = new Map<string, DirectChatMemoryLegacyCandidate[]>();
  const v2ByKey = new Map<string, DirectChatMemoryV2Candidate[]>();
  const allKeys = new Set<string>();
  legacyIndexes.forEach((item) => {
    const key = `${sourceWindowKey(item.identity) || "missing"}|${identityKey(item.identity)}`;
    const values = legacyByKey.get(key) || [];
    values.push(item.candidate);
    legacyByKey.set(key, values);
    allKeys.add(key);
  });
  v2Indexes.forEach((item) => {
    const key = `${sourceWindowKey(item.identity) || "missing"}|${identityKey(item.identity)}`;
    const values = v2ByKey.get(key) || [];
    values.push(item.candidate);
    v2ByKey.set(key, values);
    allKeys.add(key);
  });

  let matches: DirectChatMemoryMatch[] = [];
  allKeys.forEach((key) => {
    const legacy = legacyByKey.get(key) || [];
    const v2 = v2ByKey.get(key) || [];
    const sampleIdentity = legacy.length > 0 ? identityForLegacy(legacy[0]!) : identityForV2(v2[0]!);
    const match = matchGroup(legacy, v2, sourceWindowKey(sampleIdentity), key);
    const validBinding = legacy.every((item) => sameScope(item.scope, input.runtime.scope) && item.provenanceTrusted)
      && v2.every((item) => sameScope(item.candidate.scope, input.runtime.scope) && trustedCandidate(item));
    if (!validBinding && legacy.length > 0 && v2.length > 0) {
      matches.push({ ...match, correlation: "conflict", identityExact: false, reason: !legacy.every((item) => sameScope(item.scope, input.runtime.scope)) || !v2.every((item) => sameScope(item.candidate.scope, input.runtime.scope)) ? "scope_mismatch" : "provenance_mismatch" });
    } else {
      matches.push(match);
    }
  });

  // A V2 subjective/scene/relationship classification can differ in semantic
  // kind from a legacy fact while still describing the same source candidate.
  // Pair this authority-only divergence by source window so it can be vetoed;
  // never let the policy difference hide as an unmatched candidate.
  const pendingLegacy = matches.flatMap((item) => item.v2.length === 0 ? item.legacy : []);
  const pendingV2 = matches.flatMap((item) => item.legacy.length === 0 ? item.v2 : []);
  const authorityPairs: Array<{ legacy: DirectChatMemoryLegacyCandidate; v2: DirectChatMemoryV2Candidate }> = [];
  pendingLegacy.forEach((legacyCandidate) => {
    const legacyIdentity = identityForLegacy(legacyCandidate);
    const candidates = pendingV2.filter((v2Candidate) => {
      const v2Identity = identityForV2(v2Candidate);
      return sourceWindowKey(legacyIdentity)
        && sourceWindowKey(legacyIdentity) === sourceWindowKey(v2Identity)
        && sameScope(legacyCandidate.scope, input.runtime.scope)
        && sameScope(v2Candidate.candidate.scope, input.runtime.scope)
        && legacyCandidate.provenanceTrusted
        && trustedCandidate(v2Candidate)
        && authorityOnlySemanticDivergence(legacyCandidate, v2Candidate);
    });
    if (candidates.length === 1) authorityPairs.push({ legacy: legacyCandidate, v2: candidates[0]! });
  });
  if (authorityPairs.length > 0) {
    const legacyIds = new Set(authorityPairs.map((pair) => pair.legacy.id));
    const v2Ids = new Set(authorityPairs.map((pair) => pair.v2.candidate.candidateId));
    matches = matches.filter((item) => !item.legacy.some((candidate) => legacyIds.has(candidate.id)) && !item.v2.some((candidate) => v2Ids.has(candidate.candidate.candidateId)));
    authorityPairs.forEach((pair) => {
      const conflict = policyConflict(pair.legacy, pair.v2) || { fields: ["epistemicStatus"], unsafe: true };
      matches.push({
        correlation: "conflict",
        identityExact: true,
        sourceWindowKey: sourceWindowKey(identityForLegacy(pair.legacy)),
        identityKey: identityKey(identityForLegacy(pair.legacy)),
        legacy: [pair.legacy],
        v2: [pair.v2],
        policyConflict: conflict,
        reason: "ambiguous_correlation",
      });
    });
  }

  // A source-window match with a different structural identity must remain an
  // unmatched pair; it is never cross-paired by array position or statement.
  const unmatchedLegacy = legacyIndexes.filter((item) => !matches.some((match) => match.legacy.some((candidate) => candidate.id === item.candidate.id))).map((item) => item.candidate);
  const unmatchedV2 = v2Indexes.filter((item) => !matches.some((match) => match.v2.some((candidate) => candidate.candidate.candidateId === item.candidate.candidate.candidateId))).map((item) => item.candidate);
  if (unmatchedLegacy.length > 0) matches.push(...unmatchedLegacy.map((candidate) => {
    const correlation: DirectChatMemoryCorrelationState = input.v2.length === 0 ? "legacy_only" : "unmatched_legacy";
    return { correlation, identityExact: false, legacy: [candidate], v2: [] };
  }));
  if (unmatchedV2.length > 0) matches.push(...unmatchedV2.map((candidate) => {
    const correlation: DirectChatMemoryCorrelationState = input.legacy.length === 0 ? "v2_only" : "unmatched_v2";
    return { correlation, identityExact: false, legacy: [], v2: [candidate] };
  }));
  const normalizedMatches = matches.map((match) => {
    if (input.v2.length === 0 && match.legacy.length > 0 && match.v2.length === 0) return { ...match, correlation: "legacy_only" as const };
    if (input.legacy.length === 0 && match.legacy.length === 0 && match.v2.length > 0) return { ...match, correlation: "v2_only" as const };
    return match;
  });
  return { matches: normalizedMatches, unmatchedLegacy, unmatchedV2 };
}

function semanticForV2(candidate: MemoryCandidate): MemoryAdmissionComparisonSemanticKind {
  return effectiveSemanticKind(candidate);
}

function isObjectiveFact(candidate: MemoryCandidate, decision: MemoryAdmissionDecision): boolean {
  return decision.state === "accepted"
    && candidate.candidateKind === "fact"
    && candidate.epistemicStatus === "objective"
    && candidate.durability !== "temporary"
    && candidate.resolvedAuthorityRole === "durable_candidate";
}

function legacySupportsObjectiveProposal(candidate: DirectChatMemoryLegacyCandidate): boolean {
  return legacySemanticKind(candidate) === "fact"
    && candidate.policy.epistemicStatus === "objective"
    && candidate.policy.resolvedAuthorityRole === "durable_candidate";
}

function proposalFor(match: DirectChatMemoryMatch): DirectChatMemoryWriteProposal | undefined {
  const legacy = match.legacy[0];
  const v2 = match.v2[0];
  if (!legacy || !v2) return undefined;
  return {
    legacyCandidateId: legacy.id,
    v2CandidateId: v2.candidate.candidateId,
    idempotencyKey: buildMemoryCandidateIdempotencyKey(v2.candidate),
    semanticKind: semanticForV2(v2.candidate),
    sourceRefs: normalizeRefs([
      ...(v2.candidate.provenance.sourceMessageIds || []),
      ...(v2.candidate.provenance.sourceEventIds || []),
      ...(v2.candidate.provenance.sourceRecordIds || []),
      ...(v2.candidate.evidence.sourceMessageIds || []),
      ...(v2.candidate.evidence.sourceEventIds || []),
      ...(v2.candidate.evidence.sourceRecordIds || []),
    ]),
    authority: "candidate_only",
  };
}

export function validateDirectChatMemoryWriteProposal(input: {
  match: DirectChatMemoryMatch;
  proposal: DirectChatMemoryWriteProposal;
  runtime: DirectChatMemoryBridgeRuntimeContext;
  knownIdempotencyKeys?: ReadonlySet<string>;
}): { valid: true } | { valid: false; reason: DirectChatMemoryBridgeReason } {
  const legacy = input.match.legacy[0];
  const v2 = input.match.v2[0];
  if (!legacy || !v2 || input.match.correlation !== "exact" && input.match.correlation !== "duplicate") return { valid: false, reason: "ambiguous_correlation" };
  if (legacy.diagnostic.decision !== "accepted") return { valid: false, reason: "old_reject_new_accept" };
  if (v2.decision.state !== "accepted") return { valid: false, reason: "v2_candidate_not_accepted" };
  if (!legacySupportsObjectiveProposal(legacy)) return { valid: false, reason: "authority_conflict" };
  if (!sameScope(v2.candidate.scope as DirectChatMemoryBridgeScope, input.runtime.scope)) return { valid: false, reason: "scope_mismatch" };
  if (!trustedCandidate(v2)) return { valid: false, reason: "provenance_mismatch" };
  if (input.match.policyConflict?.unsafe) return { valid: false, reason: "authority_conflict" };
  if (input.knownIdempotencyKeys?.has(input.proposal.idempotencyKey)) return { valid: false, reason: "duplicate_same_intent" };
  if (!isObjectiveFact(v2.candidate, v2.decision)) return { valid: false, reason: "unknown_semantics" };
  return { valid: true };
}

/** Pure bridge decision. It never calls policy, storage, Provider or a writer. */
export function decideDirectChatMemoryBridge(
  match: DirectChatMemoryMatch,
  options: { runtime: DirectChatMemoryBridgeRuntimeContext; knownIdempotencyKeys?: ReadonlySet<string> },
): DirectChatMemoryBridgeDecision {
  if (match.correlation === "legacy_only") return { state: "legacy_passthrough", reason: "legacy_only", correlation: match.correlation };
  if (match.correlation === "v2_only" || match.correlation === "unmatched_v2") return { state: "review", reason: "v2_only_not_write_enabled", correlation: match.correlation };
  if (match.correlation === "unmatched_legacy") return { state: "legacy_passthrough", reason: "unmatched_legacy", correlation: match.correlation };
  if (match.reason === "scope_mismatch") return { state: "review", reason: "scope_mismatch", correlation: match.correlation };
  if (match.reason === "provenance_mismatch") return { state: "review", reason: "provenance_mismatch", correlation: match.correlation };
  if (match.reason === "conflicting_duplicate") return { state: "safety_veto", reason: "conflicting_duplicate", correlation: match.correlation };
  if (match.correlation === "ambiguous") {
    return { state: "review", reason: "ambiguous_correlation", correlation: match.correlation };
  }
  if (match.policyConflict?.unsafe) {
    return { state: "safety_veto", reason: "authority_conflict", correlation: match.correlation };
  }
  if (match.correlation === "duplicate") {
    const proposal = proposalFor(match);
    if (proposal && options.knownIdempotencyKeys?.has(proposal.idempotencyKey)) {
      return { state: "review", reason: "duplicate_same_intent", correlation: match.correlation };
    }
    if (proposal && validateDirectChatMemoryWriteProposal({ match, proposal, runtime: options.runtime }).valid) {
      return { state: "write_proposal", reason: "exact_objective_candidate", correlation: "duplicate", proposal };
    }
    return { state: "review", reason: "duplicate_same_intent", correlation: match.correlation };
  }
  const legacy = match.legacy[0];
  const v2 = match.v2[0];
  if (!legacy || !v2) return { state: "review", reason: "ambiguous_correlation", correlation: match.correlation };
  if (legacy.diagnostic.decision !== "accepted") {
    if (v2.decision.state === "accepted") return { state: "review", reason: "old_reject_new_accept", correlation: match.correlation };
    return { state: "review", reason: "v2_candidate_not_accepted", correlation: match.correlation };
  }
  if (isObjectiveFact(v2.candidate, v2.decision)) {
    const proposal = proposalFor(match);
    if (!proposal) return { state: "review", reason: "missing_runtime_binding", correlation: match.correlation };
    const validation = validateDirectChatMemoryWriteProposal({ match, proposal, runtime: options.runtime, knownIdempotencyKeys: options.knownIdempotencyKeys });
    if ("reason" in validation) {
      if (validation.reason === "authority_conflict") return { state: "safety_veto", reason: "authority_conflict", correlation: match.correlation };
      return { state: "review", reason: validation.reason, correlation: match.correlation };
    }
    return { state: "write_proposal", reason: "exact_objective_candidate", correlation: "exact", proposal };
  }
  const semantic = semanticForV2(v2.candidate);
  if (semantic === "belief" || semantic === "hypothesis") {
    return v2.candidate.epistemicStatus === "subjective"
      ? { state: "legacy_passthrough", reason: "cautious_belief_passthrough", correlation: match.correlation }
      : { state: "review", reason: "uncertain_belief_review", correlation: match.correlation };
  }
  if (semantic === "preference") {
    if (v2.candidate.durability === "temporary") return { state: "safety_veto", reason: "temporary_preference_not_durable", correlation: match.correlation };
    if (v2.candidate.durability === "unknown") return { state: "review", reason: "unknown_preference_durability", correlation: match.correlation };
    return { state: "review", reason: "stable_preference_review", correlation: match.correlation };
  }
  if (semantic === "plan") {
    if (v2.candidate.planLifecycle === "cancelled") return { state: "safety_veto", reason: "cancelled_plan_not_active", correlation: match.correlation };
    if (v2.candidate.planLifecycle === "completed") return { state: "safety_veto", reason: "completed_plan_not_active", correlation: match.correlation };
    if (v2.candidate.planLifecycle === "uncertain" || v2.candidate.planLifecycle === "unknown") return { state: "review", reason: "uncertain_plan_review", correlation: match.correlation };
    return { state: "review", reason: "active_plan_review", correlation: match.correlation };
  }
  if (semantic === "event") return { state: "route", reason: "event_route", correlation: match.correlation, destination: "event" };
  if (semantic === "episodic") return { state: "route", reason: "episodic_review_or_route", correlation: match.correlation, destination: "episodic" };
  if (semantic === "scene_only") {
    const legacyObjectiveTruth = legacySemanticKind(legacy) === "fact"
      && legacy.policy.epistemicStatus === "objective"
      && legacy.policy.resolvedAuthorityRole === "durable_candidate";
    return legacyObjectiveTruth
      ? { state: "safety_veto", reason: "scene_only_not_truth", correlation: match.correlation }
      : { state: "reject", reason: "scene_only_not_truth", correlation: match.correlation };
  }
  if (semantic === "relationship_signal") {
    const legacyObjectiveTruth = legacySemanticKind(legacy) === "fact"
      && legacy.policy.epistemicStatus === "objective"
      && legacy.policy.resolvedAuthorityRole === "durable_candidate";
    return legacyObjectiveTruth
      ? { state: "safety_veto", reason: "relationship_signal_review", correlation: match.correlation }
      : { state: "route", reason: "relationship_signal_review", correlation: match.correlation, destination: "relationship_review" };
  }
  return { state: "review", reason: "unknown_semantics", correlation: match.correlation };
}
