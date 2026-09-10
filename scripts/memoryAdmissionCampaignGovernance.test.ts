import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  combineLongEvidenceExports,
  type DirectChatMemoryLongEvidenceRecord,
} from "../src/features/chat/services/directChatMemoryLongEvidenceCollector";
import {
  CAMPAIGN_SCHEMA_VERSION,
  PROMOTION_POLICY_VERSION,
  WINDOW_CLOSURE_SCHEMA_VERSION,
  buildCampaignManifest,
  createPromotionScopeFingerprint,
  loadCampaignManifest,
  loadCampaignWindowInput,
  reviewMemoryAdmissionCampaignEvidence,
  type CampaignCounts,
  type CampaignWindowEvidenceInput,
  type MemoryAdmissionCampaignManifest,
  type MemoryAdmissionWindowClosureManifest,
  type PromotionScopeMapping,
  type WindowClosureReason,
  validateWindowClosureManifest,
} from "./memoryAdmissionCampaignGovernance";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realArtifactPath = path.join(projectRoot, "docs", "evidence", "memory-admission-v2", "window-8817672802574c9a", "2026-09-10__session-2febd71437e7d77e.json");
const realCampaignPath = path.join(projectRoot, "docs", "evidence", "memory-admission-v2", "campaign-memory-admission-v2-2026-09-10", "campaign.json");
const realArtifact = JSON.parse(readFileSync(realArtifactPath, "utf8")) as { records: DirectChatMemoryLongEvidenceRecord[]; [key: string]: unknown };
const baseRecord = realArtifact.records[0];

function hex(value: number, width: number): string {
  return value.toString(16).padStart(width, "0").slice(-width);
}

function makeRecord(input: {
  window: string;
  session: number;
  evidence: number;
  scope: number;
  action: number;
  batch: number;
  day: string;
  classification?: DirectChatMemoryLongEvidenceRecord["classification"];
  privacyStatus?: DirectChatMemoryLongEvidenceRecord["privacyStatus"];
}): DirectChatMemoryLongEvidenceRecord {
  return {
    ...baseRecord,
    windowFingerprint: input.window,
    windowOrdinal: 1,
    sessionOrdinal: input.session,
    sessionFingerprint: "session-" + hex(input.session, 16),
    evidenceRecordFingerprint: "evidence-" + hex(input.evidence, 16),
    scopeFingerprint: "scope-" + hex(input.scope, 8),
    logicalActionFingerprint: "action-" + hex(input.action, 8),
    batchActionFingerprint: "batch-" + hex(input.batch, 8),
    evidenceDay: input.day,
    classification: input.classification || "VALID_CONTROL",
    privacyStatus: input.privacyStatus || "metadata_only",
    providerLogicalRequestCount: 1,
    providerPhysicalAttemptCount: 1,
    accountingShape: "single_row",
    exactScope: true,
    cursorLoop: false,
    replayLoop: false,
    v2OnlyWrite: false,
    correlationClass: "shared_unique",
    candidateSuppressed: input.classification === "VALID_ELIGIBLE_SUPPRESSION",
    canaryReason: input.classification === "VALID_ELIGIBLE_SUPPRESSION" ? "SAFETY_VETO_CANCELLED_PLAN" : "none",
    validatorResult: input.classification === "VALID_ELIGIBLE_SUPPRESSION" ? "allow_veto" : "deny_veto",
  };
}

function makeArtifact(windowFingerprint: string, records: readonly DirectChatMemoryLongEvidenceRecord[]): Record<string, unknown> {
  return { ...realArtifact, windowFingerprint, records };
}

function makeClosure(
  campaignFingerprint: string,
  windowFingerprint: string,
  overrides: Partial<MemoryAdmissionWindowClosureManifest> = {},
): MemoryAdmissionWindowClosureManifest {
  return {
    schemaVersion: WINDOW_CLOSURE_SCHEMA_VERSION,
    campaignFingerprint,
    windowFingerprint,
    windowStatus: "closed",
    closureReason: "intentional_window_rotation",
    closedAtUtc: "2026-09-10T00:00:00.000Z",
    authoritativeArtifactCount: 1,
    lastAuthoritativeEvidenceDay: "2026-09-10",
    interruptedRuntimeExcluded: true,
    rawTokenPersisted: false,
    safetyIncidentCount: 0,
    privacyViolationCount: 0,
    accountingConflictCount: 0,
    authoritativeEvidence: false,
    ...overrides,
  };
}

function zeroCounts(): CampaignCounts {
  return {
    authoritativeArtifactCount: 0,
    formalSessionCount: 0,
    distinctExactScopeCount: 0,
    extractionBatchCount: 0,
    validControlCount: 0,
    validSuppressionCount: 0,
    logicalActionTotal: 0,
    physicalAttemptTotal: 0,
    distinctEvidenceDayCount: 0,
    fallbackBatchCount: 0,
    safetyIncidentCount: 0,
    privacyViolationCount: 0,
    accountingConflictCount: 0,
  };
}

function makeManifest(
  campaignFingerprint: string,
  windows: readonly string[],
  mappings: readonly PromotionScopeMapping[],
  counts: CampaignCounts = zeroCounts(),
): MemoryAdmissionCampaignManifest {
  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    campaignFingerprint,
    campaignStatus: "paused",
    promotionPolicyVersion: PROMOTION_POLICY_VERSION,
    approvedWindows: windows.map((windowFingerprint) => ({
      windowFingerprint,
      artifactPaths: ["fixture.json"],
      closurePath: "window-closure.json",
    })),
    closedWindows: [...windows],
    createdAtUtc: "2026-09-10T00:00:00.000Z",
    cumulativeAuthoritativeCounts: counts,
    zeroErrorState: { safety: true, privacy: true, accounting: true },
    firstEvidenceDay: null,
    lastEvidenceDay: null,
    thresholdProgress: {
      sessions: { current: 0, minimum: 5 },
      suppressions: { current: 0, minimum: 10 },
      scopes: { current: 0, minimum: 3 },
      days: { current: 0, minimum: 7 },
      batches: { current: 0, minimum: 20 },
      allMinimumsSatisfied: false,
      promotionEligible: false,
    },
    promotionScopeMappings: [...mappings],
  };
}

function windowInput(
  campaignFingerprint: string,
  windowFingerprint: string,
  records: readonly DirectChatMemoryLongEvidenceRecord[],
  closureOverrides: Partial<MemoryAdmissionWindowClosureManifest> = {},
): CampaignWindowEvidenceInput {
  const artifact = makeArtifact(windowFingerprint, records);
  const review = combineLongEvidenceExports([JSON.stringify(artifact)]);
  return {
    windowFingerprint,
    artifacts: [JSON.stringify(artifact)],
    closure: makeClosure(campaignFingerprint, windowFingerprint, {
      authoritativeArtifactCount: 1,
      lastAuthoritativeEvidenceDay: review.lastEvidenceDay,
      safetyIncidentCount: review.safetyIncidentCount,
      accountingConflictCount: review.accountingConflictCount,
      ...closureOverrides,
    }),
  };
}

function mappingsFor(campaignFingerprint: string, windows: readonly string[], scopes: readonly number[]): PromotionScopeMapping[] {
  return windows.flatMap((windowFingerprint) => scopes.map((scope) => ({
    windowFingerprint,
    localScopeFingerprint: "scope-" + hex(scope, 8),
    promotionScopeFingerprint: createPromotionScopeFingerprint(campaignFingerprint, [
      "automatic_direct_chat",
      "promotion-scope-" + hex(scope, 8),
    ]),
  })));
}

const campaign = "campaign-test-governance-2026";
const windowA = "window-aaaaaaaaaaaaaaaa";
const windowB = "window-bbbbbbbbbbbbbbbb";

const validClosure = makeClosure(campaign, windowA);
assert.deepEqual(validateWindowClosureManifest(validClosure, campaign, windowA), []);
assert.ok(validateWindowClosureManifest({ ...validClosure, rawToken: "must-not-appear" }, campaign, windowA).includes("closure_forbidden_data"));
assert.equal(validClosure.authoritativeEvidence, false, "closure manifests are not evidence");

const mixedWindowReview = combineLongEvidenceExports([
  JSON.stringify(makeArtifact(windowA, [makeRecord({ window: windowA, session: 1, evidence: 1, scope: 1, action: 1, batch: 1, day: "2026-09-10" })])),
  JSON.stringify(makeArtifact(windowB, [makeRecord({ window: windowB, session: 2, evidence: 2, scope: 2, action: 2, batch: 2, day: "2026-09-11" })])),
]);
assert.equal(mixedWindowReview.status, "mixed_window", "Level-1 mixed-window rejection remains strict");

const oneWindowRecord = makeRecord({ window: windowA, session: 1, evidence: 3, scope: 1, action: 3, batch: 3, day: "2026-09-10" });
const oneWindowManifest = makeManifest(campaign, [windowA], [{
  windowFingerprint: windowA,
  localScopeFingerprint: "scope-00000001",
  promotionScopeFingerprint: "promotion-scope-one",
}]);
const oneWindowReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: oneWindowManifest,
  windows: [windowInput(campaign, windowA, [oneWindowRecord])],
});
assert.equal(oneWindowReview.status, "ok");
assert.equal(oneWindowReview.authoritativeArtifactCount, 1);
assert.equal(oneWindowReview.formalSessionCount, 1);
assert.equal(oneWindowReview.distinctExactScopeCount, 1);
assert.equal(oneWindowReview.extractionBatchCount, 1);
assert.equal(oneWindowReview.validControlCount, 1);
assert.equal(oneWindowReview.logicalActionTotal, 1);
assert.equal(oneWindowReview.physicalAttemptTotal, 1);
assert.equal(oneWindowReview.distinctEvidenceDayCount, 1);

const unapprovedReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: oneWindowManifest,
  windows: [
    windowInput(campaign, windowA, [oneWindowRecord]),
    windowInput(campaign, windowB, [makeRecord({ window: windowB, session: 2, evidence: 4, scope: 2, action: 4, batch: 4, day: "2026-09-11" })]),
  ],
});
assert.equal(unapprovedReview.status, "blocked");
assert.equal(unapprovedReview.unapprovedWindowCount, 1);

const duplicateWindowReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: oneWindowManifest,
  windows: [windowInput(campaign, windowA, [oneWindowRecord]), windowInput(campaign, windowA, [oneWindowRecord])],
});
assert.equal(duplicateWindowReview.status, "blocked");
assert.equal(duplicateWindowReview.duplicateWindowCount, 1);

const wrongCampaignReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: oneWindowManifest,
  windows: [windowInput("campaign-other-governance-2026", windowA, [oneWindowRecord])],
});
assert.equal(wrongCampaignReview.status, "blocked");
assert.ok(wrongCampaignReview.errors.includes("closure_campaign_mismatch"));

const crossWindowA = makeRecord({ window: windowA, session: 1, evidence: 10, scope: 1, action: 10, batch: 10, day: "2026-09-10" });
const crossWindowB = makeRecord({ window: windowB, session: 2, evidence: 11, scope: 9, action: 11, batch: 11, day: "2026-09-10" });
const samePromotion = "promotion-scope-same";
const crossManifest = makeManifest(campaign, [windowA, windowB], [
  { windowFingerprint: windowA, localScopeFingerprint: "scope-00000001", promotionScopeFingerprint: samePromotion },
  { windowFingerprint: windowB, localScopeFingerprint: "scope-00000009", promotionScopeFingerprint: samePromotion },
]);
const crossWindowReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: crossManifest,
  windows: [windowInput(campaign, windowA, [crossWindowA]), windowInput(campaign, windowB, [crossWindowB])],
});
assert.equal(crossWindowReview.status, "ok");
assert.equal(crossWindowReview.formalSessionCount, 2);
assert.equal(crossWindowReview.distinctExactScopeCount, 1, "same promotion scope deduplicates across windows");
assert.equal(crossWindowReview.extractionBatchCount, 2);
assert.equal(crossWindowReview.distinctEvidenceDayCount, 1, "same UTC day counts once");

const conflictingMappingManifest = makeManifest(campaign, [windowA], [
  { windowFingerprint: windowA, localScopeFingerprint: "scope-00000001", promotionScopeFingerprint: "promotion-scope-one" },
  { windowFingerprint: windowA, localScopeFingerprint: "scope-00000001", promotionScopeFingerprint: "promotion-scope-two" },
]);
const conflictingMappingReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: conflictingMappingManifest,
  windows: [windowInput(campaign, windowA, [oneWindowRecord])],
});
assert.equal(conflictingMappingReview.status, "blocked");
assert.ok(conflictingMappingReview.errors.includes("duplicate_promotion_scope_mapping"));

const missingMappingReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: makeManifest(campaign, [windowA], []),
  windows: [windowInput(campaign, windowA, [oneWindowRecord])],
});
assert.equal(missingMappingReview.status, "blocked");
assert.ok(missingMappingReview.errors.includes("missing_scope_mapping"));

const copiedRecordReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: crossManifest,
  windows: [
    windowInput(campaign, windowA, [crossWindowA]),
    windowInput(campaign, windowB, [makeRecord({ window: windowB, session: 1, evidence: 10, scope: 9, action: 10, batch: 10, day: "2026-09-10" })]),
  ],
});
assert.equal(copiedRecordReview.status, "blocked");
assert.ok(copiedRecordReview.crossWindowCopyCount > 0);
assert.equal(copiedRecordReview.logicalActionTotal, 1, "copied logical action is not double counted");

const repeatedArtifactReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: oneWindowManifest,
  windows: [{
    ...windowInput(campaign, windowA, [oneWindowRecord]),
    artifacts: [JSON.stringify(makeArtifact(windowA, [oneWindowRecord])), JSON.stringify(makeArtifact(windowA, [oneWindowRecord]))],
  }],
});
assert.equal(repeatedArtifactReview.status, "ok");
assert.equal(repeatedArtifactReview.authoritativeArtifactCount, 1);

const unsafeRecord = makeRecord({
  window: windowB,
  session: 20,
  evidence: 20,
  scope: 1,
  action: 20,
  batch: 20,
  day: "2026-09-11",
  classification: "SAFETY_INCIDENT",
  privacyStatus: "violation",
});
const stickyReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: makeManifest(campaign, [windowA, windowB], [
    { windowFingerprint: windowA, localScopeFingerprint: "scope-00000001", promotionScopeFingerprint: "promotion-scope-one" },
    { windowFingerprint: windowB, localScopeFingerprint: "scope-00000001", promotionScopeFingerprint: "promotion-scope-one" },
  ]),
  windows: [windowInput(campaign, windowA, [oneWindowRecord]), windowInput(campaign, windowB, [unsafeRecord], {
    safetyIncidentCount: 1,
    privacyViolationCount: 1,
  })],
});
assert.equal(stickyReview.status, "blocked");
assert.equal(stickyReview.stickyFailure, true);
assert.equal(stickyReview.promotionEligible, false);

const thresholdRecords: DirectChatMemoryLongEvidenceRecord[] = Array.from({ length: 20 }, (_, index) => makeRecord({
  window: windowA,
  session: (index % 5) + 1,
  evidence: 100 + index,
  scope: (index % 3) + 1,
  action: 100 + index,
  batch: 100 + index,
  day: "2026-09-" + String(10 + (index % 7)).padStart(2, "0"),
  classification: "VALID_ELIGIBLE_SUPPRESSION",
}));
const thresholdManifest = makeManifest(campaign, [windowA], mappingsFor(campaign, [windowA], [1, 2, 3]));
const thresholdReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: thresholdManifest,
  windows: [windowInput(campaign, windowA, thresholdRecords)],
});
assert.equal(thresholdReview.status, "ok");
assert.equal(thresholdReview.formalSessionCount, 5);
assert.equal(thresholdReview.validSuppressionCount, 20);
assert.equal(thresholdReview.distinctExactScopeCount, 3);
assert.equal(thresholdReview.extractionBatchCount, 20);
assert.equal(thresholdReview.distinctEvidenceDayCount, 7);
assert.equal(thresholdReview.allMinimumsSatisfied, true);
assert.equal(thresholdReview.promotionEligible, true);

const tamperedManifest = makeManifest(campaign, [windowA], mappingsFor(campaign, [windowA], [1, 2, 3]), {
  ...zeroCounts(),
  authoritativeArtifactCount: 999,
  formalSessionCount: 999,
  validSuppressionCount: 999,
  extractionBatchCount: 999,
});
const tamperedReview = reviewMemoryAdmissionCampaignEvidence({
  manifest: tamperedManifest,
  windows: [windowInput(campaign, windowA, [oneWindowRecord])],
});
assert.equal(tamperedReview.authoritativeArtifactCount, 1, "manifest counts do not become evidence authority");
assert.equal(tamperedReview.promotionEligible, false);
assert.equal(tamperedReview.manifestSnapshotMatchesDerived, false);

assert.ok(validateWindowClosureManifest({ ...validClosure, rawToken: "x" }, campaign, windowA).length > 0);
assert.ok(validateWindowClosureManifest({ ...validClosure, apiKey: "x" }, campaign, windowA).length > 0);

if (existsSync(realCampaignPath)) {
  const realManifest = loadCampaignManifest(realCampaignPath);
  const realWindows = realManifest.approvedWindows.map((entry) =>
    loadCampaignWindowInput(projectRoot, entry, path.dirname(realCampaignPath), realManifest.campaignFingerprint));
  const realReview = reviewMemoryAdmissionCampaignEvidence({ manifest: realManifest, windows: realWindows });
  assert.equal(realReview.status, "ok");
  assert.equal(realReview.authoritativeArtifactCount, 1);
  assert.equal(realReview.formalSessionCount, 1);
  assert.equal(realReview.distinctExactScopeCount, 1);
  assert.equal(realReview.extractionBatchCount, 1);
  assert.equal(realReview.validControlCount, 1);
  assert.equal(realReview.validSuppressionCount, 0);
  assert.equal(realReview.logicalActionTotal, 1);
  assert.equal(realReview.physicalAttemptTotal, 2);
  assert.equal(realReview.distinctEvidenceDayCount, 1);
  assert.equal(realReview.promotionEligible, false);
}

const generatedScope = createPromotionScopeFingerprint(campaign, ["automatic_direct_chat", "character-scope", "relation-scope"]);
assert.match(generatedScope, /^promotion-scope-[0-9a-f]{16}$/u);

const generatedManifest = buildCampaignManifest({
  schemaVersion: CAMPAIGN_SCHEMA_VERSION,
  campaignFingerprint: campaign,
  campaignStatus: "paused",
  promotionPolicyVersion: PROMOTION_POLICY_VERSION,
  approvedWindows: [],
  closedWindows: [],
  createdAtUtc: "2026-09-10T00:00:00.000Z",
  promotionScopeMappings: [],
}, thresholdReview);
assert.equal(generatedManifest.cumulativeAuthoritativeCounts.validSuppressionCount, thresholdReview.validSuppressionCount);

console.log("PASS campaign governance: closure schema, explicit membership, strict Level-1 boundary, Level-2 aggregation, stable scope mapping, dedup, sticky failures, thresholds, privacy, and real-artifact review");
