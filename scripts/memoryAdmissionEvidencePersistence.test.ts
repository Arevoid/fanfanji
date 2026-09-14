import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MEMORY_ADMISSION_CAMPAIGN_FINGERPRINT,
  MEMORY_ADMISSION_SYNTHETIC_FIXTURE_ID,
  MEMORY_ADMISSION_SYNTHETIC_PROMOTION_SCOPE,
  persistGovernedMemoryAdmissionEvidence,
} from "./memoryAdmissionEvidencePersistence";
import { loadCampaignManifest, loadCampaignWindowInput, reviewMemoryAdmissionCampaignEvidence } from "./memoryAdmissionCampaignGovernance";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEvidenceRoot = path.join(projectRoot, "docs", "evidence", "memory-admission-v2");
const testRoot = mkdtempSync(path.join(os.tmpdir(), "fanfanji-admission-persistence-"));
const evidenceRoot = path.join(testRoot, "docs", "evidence", "memory-admission-v2");
cpSync(sourceEvidenceRoot, evidenceRoot, { recursive: true });

try {
  const sourceArtifactPath = path.join(evidenceRoot, "window-8817672802574c9a", "2026-09-10__session-2febd71437e7d77e.json");
  const sourceArtifact = JSON.parse(readFileSync(sourceArtifactPath, "utf8")) as Record<string, unknown> & { records: Array<Record<string, unknown>> };
  const windowFingerprint = "window-cccccccccccccccc";
  const sessionFingerprint = "session-dddddddddddddddd";
  const candidateRecord = {
    ...sourceArtifact.records[0],
    windowFingerprint,
    sessionFingerprint,
    evidenceRecordFingerprint: "evidence-eeeeeeeeeeeeeeee",
    scopeFingerprint: "scope-aaaaaaaa",
    logicalActionFingerprint: "action-bbbbbbbb",
    batchActionFingerprint: "batch-cccccccc",
    evidenceDay: "2026-09-14",
    timeBucket: "2026-09-14T00:00Z",
  };
  const candidateArtifact = JSON.stringify({
    ...sourceArtifact,
    enabled: false,
    windowState: "finished",
    windowFingerprint,
    recordCount: 1,
    formalWindowRecordCount: 1,
    formalSessionCount: 1,
    extractionBatchCount: 1,
    validControlCount: 1,
    firstEvidenceDay: "2026-09-14",
    lastEvidenceDay: "2026-09-14",
    calendarDaySpan: 1,
    records: [candidateRecord],
  });

  const campaignPath = path.join(testRoot, "docs", "evidence", "memory-admission-v2", "campaign-memory-admission-v2-2026-09-10", "campaign.json");
  const beforeManifest = loadCampaignManifest(campaignPath);
  const beforeWindows = beforeManifest.approvedWindows.map((entry) => loadCampaignWindowInput(
    testRoot,
    entry,
    path.dirname(campaignPath),
    beforeManifest.campaignFingerprint,
  ));
  const before = reviewMemoryAdmissionCampaignEvidence({ manifest: beforeManifest, windows: beforeWindows });
  assert.equal(before.status, "ok");
  const beforeBatchCount = before.extractionBatchCount;
  const beforeSessionCount = before.formalSessionCount;
  const beforeDayCount = before.distinctEvidenceDayCount;
  const beforeControlCount = before.validControlCount;

  const persisted = persistGovernedMemoryAdmissionEvidence({
    projectRoot: testRoot,
    artifactJson: candidateArtifact,
    fixtureId: MEMORY_ADMISSION_SYNTHETIC_FIXTURE_ID,
    promotionScopeFingerprint: MEMORY_ADMISSION_SYNTHETIC_PROMOTION_SCOPE,
    closedAtUtc: "2026-09-14T12:00:00.000Z",
  });
  assert.equal(persisted.status, "persisted");
  assert.equal(persisted.campaignFingerprint, MEMORY_ADMISSION_CAMPAIGN_FINGERPRINT);
  assert.equal(persisted.reviewerBefore?.extractionBatchCount, beforeBatchCount);
  assert.equal(persisted.reviewerAfter?.extractionBatchCount, beforeBatchCount + 1, "reviewer derives the canary batch increment");
  assert.equal(persisted.reviewerAfter?.formalSessionCount, beforeSessionCount + 1);
  assert.equal(persisted.reviewerAfter?.distinctEvidenceDayCount, beforeDayCount);
  assert.equal(persisted.reviewerAfter?.validControlCount, beforeControlCount + 1);
  assert.ok(persisted.artifactPath && existsSync(persisted.artifactPath));
  assert.ok(persisted.closurePath && existsSync(persisted.closurePath));
  const savedArtifact = readFileSync(persisted.artifactPath!, "utf8");
  assert.doesNotMatch(savedArtifact, /"(?:apiKey|authorization|message|statement|response|sourceId|logicalActionId|windowToken)"\s*:/iu);

  const duplicate = persistGovernedMemoryAdmissionEvidence({
    projectRoot: testRoot,
    artifactJson: candidateArtifact,
    fixtureId: MEMORY_ADMISSION_SYNTHETIC_FIXTURE_ID,
    promotionScopeFingerprint: MEMORY_ADMISSION_SYNTHETIC_PROMOTION_SCOPE,
    closedAtUtc: "2026-09-14T12:05:00.000Z",
  });
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.reviewerBefore?.extractionBatchCount, beforeBatchCount + 1);
  assert.equal(duplicate.reviewerAfter?.extractionBatchCount, beforeBatchCount + 1, "replay does not double count");

  const rejected = persistGovernedMemoryAdmissionEvidence({
    projectRoot: testRoot,
    artifactJson: JSON.stringify({ ...JSON.parse(candidateArtifact), apiKey: "must never persist" }),
    fixtureId: MEMORY_ADMISSION_SYNTHETIC_FIXTURE_ID,
    promotionScopeFingerprint: MEMORY_ADMISSION_SYNTHETIC_PROMOTION_SCOPE,
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reason, "artifact_rejected_by_level_one_reviewer");

  const afterManifest = loadCampaignManifest(campaignPath);
  assert.equal(afterManifest.cumulativeAuthoritativeCounts.extractionBatchCount, beforeBatchCount + 1);
  assert.equal(afterManifest.cumulativeAuthoritativeCounts.formalSessionCount, beforeSessionCount + 1);
  assert.equal(afterManifest.cumulativeAuthoritativeCounts.distinctEvidenceDayCount, beforeDayCount);
  assert.equal(afterManifest.cumulativeAuthoritativeCounts.validControlCount, beforeControlCount + 1);
  assert.equal(afterManifest.approvedWindows.some((entry) => entry.windowFingerprint === windowFingerprint), true);
  assert.equal(afterManifest.campaignFingerprint, MEMORY_ADMISSION_CAMPAIGN_FINGERPRINT);
  console.log("PASS governed Admission evidence persistence, reviewer cutover, schema/privacy gate, and replay idempotency");
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}
