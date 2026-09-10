import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LONG_EVIDENCE_SCHEMA_VERSION,
  type DirectChatMemoryLongEvidenceRecord,
} from "../src/features/chat/services/directChatMemoryLongEvidenceCollector";
import { reviewMemoryAdmissionLongEvidenceArtifacts } from "./reviewMemoryAdmissionLongEvidence";

const baseRecord: DirectChatMemoryLongEvidenceRecord = {
  schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION,
  timeBucket: "2026-09-10T13:00",
  featureScope: "automatic_direct_chat",
  sessionOrdinal: 1,
  windowOrdinal: 1,
  windowFingerprint: "window-aaaaaaaaaaaaaaaa",
  sessionFingerprint: "session-bbbbbbbbbbbbbbbb",
  evidenceRecordFingerprint: "evidence-cccccccccccccccc",
  observationOrdinal: 1,
  evidenceDay: "2026-09-10",
  evidenceMode: "formal_window",
  scopeFingerprint: "scope-dddddddd",
  logicalActionFingerprint: "action-eeeeeeee",
  batchActionFingerprint: "batch-ffffffff",
  canaryReason: "none",
  validatorResult: "deny_veto",
  validatorReason: "bridge_not_safety_veto",
  bridgeState: "route",
  bridgeReason: "no_veto",
  correlationClass: "shared_unique",
  lineageStatus: "shared",
  pairUnique: true,
  exactScope: true,
  provenanceTrusted: true,
  metadataSource: "v2_model_native",
  semanticKind: "unknown",
  planLifecycle: "unknown",
  legacyAccepted: true,
  legacyWriteEligible: true,
  candidateSuppressed: false,
  vetoedCandidateCanonicalAbsent: false,
  failOpen: false,
  batchAcceptedBefore: 1,
  batchAcceptedAfter: 1,
  batchZeroCandidates: false,
  survivingCanonicalWritesExpected: true,
  survivingCanonicalWritesObserved: true,
  cursorAdvanced: true,
  canonicalWriteCountDelta: 1,
  summaryDelta: 0,
  projectionDelta: 1,
  providerLogicalRequestCount: 1,
  providerPhysicalAttemptCount: 1,
  accountingShape: "single_row",
  promptDelta: 0,
  canaryProviderDelta: 0,
  extractionLatencyBucket: "0_5s",
  canaryFilteringLatencyBucket: "0_10ms",
  privacyStatus: "metadata_only",
  vetoedCandidateSummaryPresent: false,
  vetoedCandidateProjectionPresent: false,
  v2OnlyWrite: false,
  cursorLoop: false,
  replayLoop: false,
  blockingMaterialUserRegression: false,
  classification: "VALID_CONTROL",
};

function record(overrides: Partial<DirectChatMemoryLongEvidenceRecord> = {}): DirectChatMemoryLongEvidenceRecord {
  return { ...baseRecord, ...overrides };
}

function exportJson(records: readonly DirectChatMemoryLongEvidenceRecord[]): string {
  return JSON.stringify({ schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION, records });
}

function withArtifacts<T>(files: readonly { name: string; contents: string }[], callback: (paths: string[]) => T): T {
  const directory = mkdtempSync(path.join(os.tmpdir(), "memory-evidence-review-"));
  try {
    const paths = files.map(({ name, contents }) => {
      const filePath = path.join(directory, name);
      writeFileSync(filePath, contents, "utf8");
      return filePath;
    });
    return callback(paths);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function review(contents: readonly string[]) {
  return withArtifacts(contents.map((value, index) => ({ name: `artifact-${index}.json`, contents: value })), (paths) =>
    reviewMemoryAdmissionLongEvidenceArtifacts(paths));
}

const valid = exportJson([record()]);

const zeroRetained = review([]);
assert.equal(zeroRetained.status, "ok");
assert.equal(zeroRetained.authoritativeArtifactCount, 0);
assert.equal(zeroRetained.formalSessionCount, 0);
assert.equal(zeroRetained.distinctExactScopeCount, 0);
assert.equal(zeroRetained.extractionBatchCount, 0);
assert.equal(zeroRetained.validSuppressionCount, 0);
assert.equal(zeroRetained.validControlCount, 0);
assert.equal(zeroRetained.logicalActionTotal, 0);
assert.equal(zeroRetained.physicalAttemptTotal, 0);
assert.equal(zeroRetained.firstEvidenceDay, null);
assert.equal(zeroRetained.lastEvidenceDay, null);
assert.equal(zeroRetained.distinctEvidenceDayCount, 0);

assert.doesNotThrow(() => review([valid]));
const single = review([valid]);
assert.equal(single.status, "ok");
assert.equal(single.schemaVersion, LONG_EVIDENCE_SCHEMA_VERSION);
assert.equal(single.windowCount, 1);
assert.equal(single.windowFingerprint, "window-aaaaaaaaaaaaaaaa");
assert.equal(single.mixedWindow, false);
assert.equal(single.malformedExportCount, 0);
assert.equal(single.malformedRecordCount, 0);
assert.equal(single.rawRecordCount, 1);
assert.equal(single.dedupedRecordCount, 1);
assert.equal(single.formalSessionCount, 1);
assert.equal(single.distinctExactScopeCount, 1);
assert.equal(single.extractionBatchCount, 1);
assert.equal(single.validControlCount, 1);
assert.equal(single.validSuppressionCount, 0);
assert.equal(single.failOpenCount, 0);
assert.equal(single.invalidSampleCount, 0);
assert.equal(single.safetyIncidentCount, 0);
assert.equal(single.logicalActionTotal, 1);
assert.equal(single.physicalAttemptTotal, 1);
assert.equal(single.accountingConflictCount, 0);
assert.equal(single.unknownGroupingCount, 0);
assert.equal(single.firstEvidenceDay, "2026-09-10");
assert.equal(single.lastEvidenceDay, "2026-09-10");
assert.equal(single.distinctEvidenceDayCount, 1);
assert.equal(single.authoritativeArtifactCount, 1);
assert.equal(single.rejectedArtifactCount, 0);
assert.equal(single.privacyViolationCount, 0);

const duplicate = review([valid, valid]);
assert.equal(duplicate.status, "ok");
assert.equal(duplicate.rawRecordCount, 2);
assert.equal(duplicate.dedupedRecordCount, 1);
assert.equal(duplicate.logicalActionTotal, 1);

const secondRecord = record({
  evidenceRecordFingerprint: "evidence-1111111111111111",
  sessionFingerprint: "session-2222222222222222",
  logicalActionFingerprint: "action-33333333",
  batchActionFingerprint: "batch-44444444",
});
const multi = review([exportJson([baseRecord, secondRecord])]);
assert.equal(multi.rawRecordCount, 2);
assert.equal(multi.dedupedRecordCount, 2);
assert.equal(multi.formalSessionCount, 2);
assert.equal(multi.extractionBatchCount, 2);
assert.equal(multi.logicalActionTotal, 2);

const conflictingDuplicate = review([valid, exportJson([record({ providerPhysicalAttemptCount: 2 })])]);
assert.equal(conflictingDuplicate.status, "ok");
assert.equal(conflictingDuplicate.dedupedRecordCount, 1);
assert.equal(conflictingDuplicate.accountingConflictCount, 1);

const mixed = review([valid, exportJson([record({
  windowFingerprint: "window-bbbbbbbbbbbbbbbb",
  evidenceRecordFingerprint: "evidence-2222222222222222",
  sessionFingerprint: "session-3333333333333333",
  logicalActionFingerprint: "action-44444444",
  batchActionFingerprint: "batch-55555555",
})])]);
assert.equal(mixed.status, "mixed_window");
assert.equal(mixed.mixedWindow, true);
assert.equal(mixed.windowCount, 2);

const malformed = review(["{not-json", JSON.stringify({ schemaVersion: "wrong", records: [baseRecord] })]);
assert.equal(malformed.status, "malformed");
assert.equal(malformed.malformedExportCount, 2);
assert.equal(malformed.rawRecordCount, 0);
assert.equal(malformed.authoritativeArtifactCount, 0);
assert.equal(malformed.rejectedArtifactCount, 2);

const summaryOnly = review([JSON.stringify({
  schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION,
  status: "ok",
  formalSessionCount: 99,
  extractionBatchCount: 99,
  validControlCount: 99,
})]);
assert.equal(summaryOnly.status, "malformed");
assert.equal(summaryOnly.rawRecordCount, 0);
assert.equal(summaryOnly.formalSessionCount, 0);
assert.equal(summaryOnly.extractionBatchCount, 0);
assert.equal(summaryOnly.validControlCount, 0);
assert.equal(summaryOnly.authoritativeArtifactCount, 0);

const emptyRecords = review([JSON.stringify({ schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION, records: [] })]);
assert.equal(emptyRecords.status, "malformed");
assert.equal(emptyRecords.authoritativeArtifactCount, 0);

const unrecoverableLabels = review([JSON.stringify({
  schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION,
  excludedHistoricalArtifacts: ["R2_EXPORT_UNRECOVERABLE", "11O_EXPORT_UNRECOVERABLE"],
  retainedAuthoritativeArtifactCount: 99,
})]);
assert.equal(unrecoverableLabels.status, "malformed");
assert.equal(unrecoverableLabels.formalSessionCount, 0);
assert.equal(unrecoverableLabels.extractionBatchCount, 0);
assert.equal(unrecoverableLabels.validControlCount, 0);

const recoveryManifest = readFileSync(path.resolve(
  "docs/evidence/memory-admission-v2/window-8817672802574c9a/recovery-boundary.json",
), "utf8");
assert.equal(recoveryManifest.includes("raw window token"), false);
const manifestReview = review([recoveryManifest]);
assert.equal(manifestReview.status, "malformed");
assert.equal(manifestReview.authoritativeArtifactCount, 0);
assert.equal(manifestReview.formalSessionCount, 0);
assert.equal(manifestReview.extractionBatchCount, 0);

const futureFirstArtifact = review([exportJson([record({
  evidenceRecordFingerprint: "evidence-8888888888888888",
  sessionFingerprint: "session-8888888888888888",
  logicalActionFingerprint: "action-bbbbbbbb",
  batchActionFingerprint: "batch-cccccccc",
  evidenceDay: "2026-09-12",
})])]);
assert.equal(futureFirstArtifact.status, "ok");
assert.equal(futureFirstArtifact.windowFingerprint, "window-aaaaaaaaaaaaaaaa");
assert.equal(futureFirstArtifact.authoritativeArtifactCount, 1);
assert.equal(futureFirstArtifact.formalSessionCount, 1);
assert.equal(futureFirstArtifact.firstEvidenceDay, "2026-09-12");
assert.equal(futureFirstArtifact.distinctEvidenceDayCount, 1);

const malformedRecord = review([exportJson([record({ evidenceRecordFingerprint: "not-a-fingerprint" })])]);
assert.equal(malformedRecord.status, "malformed");
assert.equal(malformedRecord.rawRecordCount, 0);
assert.equal(malformedRecord.malformedRecordCount, 1);
assert.equal(malformedRecord.authoritativeArtifactCount, 1);

const incompleteRecordValue = { ...record() } as Record<string, unknown>;
delete incompleteRecordValue.providerPhysicalAttemptCount;
const incompleteRecord = review([exportJson([incompleteRecordValue as unknown as DirectChatMemoryLongEvidenceRecord])]);
assert.equal(incompleteRecord.status, "malformed");
assert.equal(incompleteRecord.rawRecordCount, 0);
assert.equal(incompleteRecord.malformedRecordCount, 1);
assert.equal(incompleteRecord.formalSessionCount, 0);

const privacyFixtures = [
  { prompt: "do not persist", records: [record()] },
  { response: "do not persist", records: [record()] },
  { Authorization: "Bearer secret", records: [record()] },
  { apiKey: "sk-secret", records: [record()] },
  { logicalActionId: "action-raw", records: [record()] },
  { windowReviewToken: "redacted-test-token", records: [record()] },
  { rawContent: "message body", records: [record()] },
  { errorMessage: "provider rejected", records: [record()] },
];
for (const fixture of privacyFixtures) {
  const rejected = review([JSON.stringify({ schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION, ...fixture })]);
  assert.equal(rejected.status, "malformed");
  assert.equal(rejected.privacyViolationCount, 1);
  assert.equal(rejected.rawRecordCount, 0);
  assert.equal(rejected.authoritativeArtifactCount, 0);
}

const dryRun = review([exportJson([record({
  evidenceMode: "dry_run",
  windowFingerprint: null,
  windowOrdinal: null,
  evidenceRecordFingerprint: "evidence-3333333333333333",
  sessionFingerprint: "session-4444444444444444",
  logicalActionFingerprint: "action-55555555",
  batchActionFingerprint: "batch-66666666",
})])]);
assert.equal(dryRun.status, "ok");
assert.equal(dryRun.rawRecordCount, 1);
assert.equal(dryRun.formalSessionCount, 0);
assert.equal(dryRun.extractionBatchCount, 0);
assert.equal(dryRun.logicalActionTotal, 0);
assert.equal(dryRun.distinctEvidenceDayCount, 0);

const safety = review([exportJson([record({
  classification: "SAFETY_INCIDENT",
  evidenceRecordFingerprint: "evidence-4444444444444444",
  logicalActionFingerprint: "unknown",
  batchActionFingerprint: "unknown",
})])]);
assert.equal(safety.status, "ok");
assert.equal(safety.safetyIncidentCount, 1);
assert.equal(safety.logicalActionTotal, 0);

const unknownGrouping = review([exportJson([record({
  evidenceRecordFingerprint: "evidence-5555555555555555",
  logicalActionFingerprint: "unknown",
  batchActionFingerprint: "unknown",
})])]);
assert.equal(unknownGrouping.status, "ok");
assert.equal(unknownGrouping.unknownGroupingCount, 1);
assert.equal(unknownGrouping.logicalActionTotal, 0);
assert.equal(unknownGrouping.extractionBatchCount, 0);

const daySpan = review([exportJson([
  record(),
  record({
    evidenceRecordFingerprint: "evidence-6666666666666666",
    sessionFingerprint: "session-6666666666666666",
    logicalActionFingerprint: "action-77777777",
    batchActionFingerprint: "batch-88888888",
    evidenceDay: "2026-09-11",
  }),
  record({
    evidenceMode: "dry_run",
    windowFingerprint: null,
    windowOrdinal: null,
    evidenceRecordFingerprint: "evidence-7777777777777777",
    sessionFingerprint: "session-7777777777777777",
    logicalActionFingerprint: "action-99999999",
    batchActionFingerprint: "batch-aaaaaaaa",
    evidenceDay: "2026-09-12",
  }),
])]);
assert.equal(daySpan.firstEvidenceDay, "2026-09-10");
assert.equal(daySpan.lastEvidenceDay, "2026-09-11");
assert.equal(daySpan.distinctEvidenceDayCount, 2);

console.log("PASS sanitized long-evidence artifact review: durable shape, privacy rejection, deduplication, mixed-window safety, accounting conflicts, dry-run exclusion, and summary non-authority");
