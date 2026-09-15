import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCampaignManifest,
  loadCampaignWindowInput,
  reviewMemoryAdmissionCampaignEvidence,
} from "./memoryAdmissionCampaignGovernance";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const campaignPath = path.join(
  projectRoot,
  "docs",
  "evidence",
  "memory-admission-v2",
  "campaign-memory-admission-v2-2026-09-10",
  "campaign.json",
);

const manifest = loadCampaignManifest(campaignPath);
const windows = manifest.approvedWindows.map((entry) =>
  loadCampaignWindowInput(projectRoot, entry, path.dirname(campaignPath), manifest.campaignFingerprint));
const review = reviewMemoryAdmissionCampaignEvidence({ manifest, windows });

assert.equal(review.status, "ok");
assert.equal(manifest.promotionPolicyVersion, "memory-admission-v2-promotion-2");
assert.deepEqual(
  {
    artifacts: review.authoritativeArtifactCount,
    sessions: review.formalSessionCount,
    scopes: review.distinctExactScopeCount,
    batches: review.extractionBatchCount,
    controls: review.validControlCount,
    suppressions: review.validSuppressionCount,
    days: review.distinctEvidenceDayCount,
    incidents: [review.safetyIncidentCount, review.privacyViolationCount, review.accountingConflictCount],
    promotionEligible: review.promotionEligible,
    manifestSnapshotMatchesDerived: review.manifestSnapshotMatchesDerived,
    thresholdProgressMatchesDerived: review.manifestThresholdProgressMatchesDerived,
  },
  {
    artifacts: 17,
    sessions: 16,
    scopes: 4,
    batches: 20,
    controls: 14,
    suppressions: 10,
    days: 5,
    incidents: [0, 0, 0],
    promotionEligible: true,
    manifestSnapshotMatchesDerived: true,
    thresholdProgressMatchesDerived: true,
  },
);

console.log("PASS authoritative Admission evidence reconciliation");
