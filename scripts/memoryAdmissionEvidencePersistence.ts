import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildCampaignManifest,
  loadCampaignManifest,
  loadCampaignWindowInput,
  reviewMemoryAdmissionCampaignEvidence,
  type CampaignReviewResult,
  type MemoryAdmissionCampaignManifest,
  type MemoryAdmissionWindowClosureManifest,
} from "./memoryAdmissionCampaignGovernance";
import {
  combineLongEvidenceExports,
  LONG_EVIDENCE_SCHEMA_VERSION,
  type DirectChatMemoryLongEvidenceExport,
  type DirectChatMemoryLongEvidenceRecord,
} from "../src/features/chat/services/directChatMemoryLongEvidenceCollector";
import {
  MEMORY_ADMISSION_CAMPAIGN_FINGERPRINT,
  MEMORY_ADMISSION_SYNTHETIC_FIXTURE_ID,
  MEMORY_ADMISSION_SYNTHETIC_PROMOTION_SCOPE,
} from "../src/features/chat/services/directChatMemoryLongEvidencePersistenceProtocol";

export {
  MEMORY_ADMISSION_CAMPAIGN_FINGERPRINT,
  MEMORY_ADMISSION_SYNTHETIC_FIXTURE_ID,
  MEMORY_ADMISSION_SYNTHETIC_PROMOTION_SCOPE,
} from "../src/features/chat/services/directChatMemoryLongEvidencePersistenceProtocol";

/** The only campaign writable through the dev synthetic evidence seam. */
export const MEMORY_ADMISSION_CAMPAIGN_RELATIVE_PATH =
  "docs/evidence/memory-admission-v2/campaign-memory-admission-v2-2026-09-10/campaign.json" as const;

type PersistenceStatus = "persisted" | "duplicate" | "rejected" | "conflict";

export interface MemoryAdmissionEvidencePersistenceResult {
  status: PersistenceStatus;
  reason?: string;
  campaignFingerprint: typeof MEMORY_ADMISSION_CAMPAIGN_FINGERPRINT;
  windowFingerprint: string | null;
  artifactPath: string | null;
  closurePath: string | null;
  campaignPath: string;
  reviewerBefore: CampaignReviewResult | null;
  reviewerAfter: CampaignReviewResult | null;
}

interface CandidateArtifact {
  artifact: DirectChatMemoryLongEvidenceExport;
  artifactText: string;
  windowFingerprint: string;
  sessionFingerprint: string;
  evidenceDay: string;
  localScopeFingerprints: string[];
  levelOneReview: ReturnType<typeof combineLongEvidenceExports>;
}

const WINDOW_FINGERPRINT = /^window-[0-9a-f]{16}$/u;
const SESSION_FINGERPRINT = /^session-[0-9a-f]{16}$/u;
const SCOPE_FINGERPRINT = /^scope-[0-9a-f]{8}$/u;
const EVIDENCE_DAY = /^\d{4}-\d{2}-\d{2}$/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function artifactHash(raw: string): string {
  let value: unknown = raw;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    // The caller has already validated JSON. Keeping this fallback makes the
    // duplicate scan fail closed if a future caller changes that contract.
  }
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function atomicWrite(pathname: string, content: string): void {
  const temporaryPath = `${pathname}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx" });
  try {
    renameSync(temporaryPath, pathname);
  } catch (error) {
    try {
      // A failed rename must not leave a candidate artifact that the reviewer
      // could accidentally discover on a later run.
      unlinkSync(temporaryPath);
    } catch {
      // Preserve the original error while remaining fail-closed.
    }
    throw error;
  }
}

function campaignPathFor(projectRoot: string): string {
  return path.resolve(projectRoot, MEMORY_ADMISSION_CAMPAIGN_RELATIVE_PATH);
}

function readCampaignReview(projectRoot: string, campaignPath: string): {
  manifest: MemoryAdmissionCampaignManifest;
  review: CampaignReviewResult;
  windows: ReturnType<typeof loadCampaignWindowInput>[];
} {
  const manifest = loadCampaignManifest(campaignPath);
  if (manifest.campaignFingerprint !== MEMORY_ADMISSION_CAMPAIGN_FINGERPRINT) {
    throw new Error("campaign_fingerprint_not_allowed");
  }
  const manifestDirectory = path.dirname(campaignPath);
  const windows = manifest.approvedWindows.map((entry) =>
    loadCampaignWindowInput(projectRoot, entry, manifestDirectory, manifest.campaignFingerprint));
  const review = reviewMemoryAdmissionCampaignEvidence({ manifest, windows });
  if (review.status !== "ok") throw new Error("campaign_reviewer_before_failed");
  return { manifest, review, windows };
}

function parseCandidateArtifact(artifactJson: string): CandidateArtifact | null {
  if (typeof artifactJson !== "string" || artifactJson.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(artifactJson) as unknown;
  } catch {
    return null;
  }
  if (!isObject(parsed)
    || parsed.schemaVersion !== LONG_EVIDENCE_SCHEMA_VERSION
    || !Array.isArray(parsed.records)) return null;
  const levelOneReview = combineLongEvidenceExports([artifactJson]);
  if (levelOneReview.status !== "ok"
    || levelOneReview.malformedExportCount !== 0
    || levelOneReview.malformedRecordCount !== 0
    || !levelOneReview.windowFingerprint
    || levelOneReview.windowCount !== 1
    || levelOneReview.formalWindowRecordCount === 0
    || (levelOneReview.validControlCount + levelOneReview.validSuppressionCount + levelOneReview.zeroCandidateBatchCount) === 0) {
    return null;
  }
  const records = parsed.records as DirectChatMemoryLongEvidenceRecord[];
  const formalRecords = records.filter((record) => record.evidenceMode === "formal_window");
  if (formalRecords.length === 0
    || formalRecords.some((record) => record.windowFingerprint !== levelOneReview.windowFingerprint)
    || formalRecords.some((record) => !SESSION_FINGERPRINT.test(record.sessionFingerprint))
    || formalRecords.some((record) => !SCOPE_FINGERPRINT.test(record.scopeFingerprint))) return null;
  const sessionFingerprints = [...new Set(formalRecords.map((record) => record.sessionFingerprint))];
  const localScopeFingerprints = [...new Set(formalRecords.map((record) => record.scopeFingerprint))];
  if (sessionFingerprints.length !== 1 || localScopeFingerprints.length !== 1) return null;
  if (!EVIDENCE_DAY.test(levelOneReview.lastEvidenceDay || "")) return null;
  const artifact = parsed as unknown as DirectChatMemoryLongEvidenceExport;
  const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
  return {
    artifact,
    artifactText,
    windowFingerprint: levelOneReview.windowFingerprint,
    sessionFingerprint: sessionFingerprints[0],
    evidenceDay: levelOneReview.lastEvidenceDay!,
    localScopeFingerprints,
    levelOneReview,
  };
}

function allApprovedArtifactPaths(
  projectRoot: string,
  manifest: MemoryAdmissionCampaignManifest,
): string[] {
  return manifest.approvedWindows.flatMap((entry) => entry.artifactPaths.map((artifactPath) => {
    const resolved = path.isAbsolute(artifactPath) ? artifactPath : path.resolve(projectRoot, artifactPath);
    return resolved;
  }));
}

function findDuplicateArtifact(projectRoot: string, manifest: MemoryAdmissionCampaignManifest, hash: string): boolean {
  return allApprovedArtifactPaths(projectRoot, manifest).some((artifactPath) => {
    if (!existsSync(artifactPath)) return false;
    try {
      return artifactHash(readFileSync(artifactPath, "utf8")) === hash;
    } catch {
      return false;
    }
  });
}

function result(
  status: PersistenceStatus,
  campaignPath: string,
  reviewerBefore: CampaignReviewResult | null,
  reviewerAfter: CampaignReviewResult | null,
  candidate?: CandidateArtifact,
  paths?: { artifactPath: string; closurePath: string },
  reason?: string,
): MemoryAdmissionEvidencePersistenceResult {
  return {
    status,
    ...(reason ? { reason } : {}),
    campaignFingerprint: MEMORY_ADMISSION_CAMPAIGN_FINGERPRINT,
    windowFingerprint: candidate?.windowFingerprint || null,
    artifactPath: paths?.artifactPath || null,
    closurePath: paths?.closurePath || null,
    campaignPath,
    reviewerBefore,
    reviewerAfter,
  };
}

/**
 * Persist one sanitized, synthetic, governed window and derive campaign state
 * exclusively through the existing reviewer. No direct counter mutation is
 * possible through this function.
 */
export function persistGovernedMemoryAdmissionEvidence(input: {
  projectRoot: string;
  artifactJson: string;
  fixtureId: string;
  promotionScopeFingerprint: string;
  closedAtUtc?: string;
}): MemoryAdmissionEvidencePersistenceResult {
  const campaignPath = campaignPathFor(input.projectRoot);
  if (input.fixtureId !== MEMORY_ADMISSION_SYNTHETIC_FIXTURE_ID
    || input.promotionScopeFingerprint !== MEMORY_ADMISSION_SYNTHETIC_PROMOTION_SCOPE) {
    return result("rejected", campaignPath, null, null, undefined, undefined, "synthetic_mapping_not_allowed");
  }
  const candidate = parseCandidateArtifact(input.artifactJson);
  if (!candidate) return result("rejected", campaignPath, null, null, undefined, undefined, "artifact_rejected_by_level_one_reviewer");
  let current: ReturnType<typeof readCampaignReview>;
  try {
    current = readCampaignReview(input.projectRoot, campaignPath);
  } catch (error) {
    return result("rejected", campaignPath, null, null, candidate, undefined, error instanceof Error ? error.message : "campaign_read_failed");
  }
  const { manifest, review: reviewerBefore, windows: existingWindows } = current;
  const artifactHashValue = artifactHash(candidate.artifactText);
  if (findDuplicateArtifact(input.projectRoot, manifest, artifactHashValue)) {
    return result("duplicate", campaignPath, reviewerBefore, reviewerBefore, candidate, undefined, "artifact_already_authoritative");
  }
  if (manifest.approvedWindows.some((entry) => entry.windowFingerprint === candidate.windowFingerprint)) {
    return result("conflict", campaignPath, reviewerBefore, reviewerBefore, candidate, undefined, "window_already_approved_with_different_artifact");
  }

  const evidenceDirectory = path.resolve(
    input.projectRoot,
    "docs/evidence/memory-admission-v2",
    candidate.windowFingerprint,
  );
  const artifactPath = path.join(evidenceDirectory, `${candidate.evidenceDay}__${candidate.sessionFingerprint}.json`);
  const closurePath = path.join(evidenceDirectory, "window-closure.json");
  if (existsSync(artifactPath) || existsSync(closurePath)) {
    return result("conflict", campaignPath, reviewerBefore, reviewerBefore, candidate, { artifactPath, closurePath }, "target_window_directory_exists");
  }

  const closedAtUtc = input.closedAtUtc || new Date().toISOString();
  const closure: MemoryAdmissionWindowClosureManifest = {
    schemaVersion: "memory-admission-v2-window-closure-1",
    campaignFingerprint: manifest.campaignFingerprint,
    windowFingerprint: candidate.windowFingerprint,
    windowStatus: "closed",
    closureReason: "intentional_window_rotation",
    closedAtUtc,
    authoritativeArtifactCount: 1,
    lastAuthoritativeEvidenceDay: candidate.levelOneReview.lastEvidenceDay,
    interruptedRuntimeExcluded: true,
    rawTokenPersisted: false,
    safetyIncidentCount: candidate.levelOneReview.safetyIncidentCount,
    privacyViolationCount: 0,
    accountingConflictCount: candidate.levelOneReview.accountingConflictCount,
    authoritativeEvidence: false,
  };
  const approvedWindow = {
    windowFingerprint: candidate.windowFingerprint,
    artifactPaths: [path.relative(input.projectRoot, artifactPath).replaceAll(path.sep, "/")],
    closurePath: path.relative(input.projectRoot, closurePath).replaceAll(path.sep, "/"),
  };
  const baseManifest = {
    ...manifest,
    approvedWindows: [...manifest.approvedWindows, approvedWindow],
    closedWindows: [...manifest.closedWindows, candidate.windowFingerprint],
    promotionScopeMappings: [
      ...manifest.promotionScopeMappings,
      ...candidate.localScopeFingerprints.map((localScopeFingerprint) => ({
        windowFingerprint: candidate.windowFingerprint,
        localScopeFingerprint,
        promotionScopeFingerprint: input.promotionScopeFingerprint,
      })),
    ],
  };
  const candidateWindow = { windowFingerprint: candidate.windowFingerprint, artifacts: [candidate.artifactText], closure };
  const provisionalReview = reviewMemoryAdmissionCampaignEvidence({
    manifest: baseManifest,
    windows: [...existingWindows, candidateWindow],
  });
  if (provisionalReview.status !== "ok") {
    return result("rejected", campaignPath, reviewerBefore, provisionalReview, candidate, { artifactPath, closurePath }, `campaign_reviewer_rejected:${provisionalReview.errors.join(",")}`);
  }
  const nextManifest = buildCampaignManifest(baseManifest, provisionalReview);
  const reviewerAfter = reviewMemoryAdmissionCampaignEvidence({
    manifest: nextManifest,
    windows: [...existingWindows, candidateWindow],
  });
  if (reviewerAfter.status !== "ok" || !reviewerAfter.manifestSnapshotMatchesDerived || !reviewerAfter.manifestThresholdProgressMatchesDerived) {
    return result("rejected", campaignPath, reviewerBefore, reviewerAfter, candidate, { artifactPath, closurePath }, `campaign_reviewer_validation_failed:${reviewerAfter.errors.join(",")}`);
  }

  try {
    mkdirSync(evidenceDirectory, { recursive: true });
    atomicWrite(artifactPath, candidate.artifactText);
    atomicWrite(closurePath, `${JSON.stringify(closure, null, 2)}\n`);
    atomicWrite(campaignPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  } catch (error) {
    return result("rejected", campaignPath, reviewerBefore, reviewerAfter, candidate, { artifactPath, closurePath }, error instanceof Error ? "durable_write_failed" : "durable_write_failed");
  }
  return result("persisted", campaignPath, reviewerBefore, reviewerAfter, candidate, { artifactPath, closurePath });
}

/** Read-only helper used by the dev browser client to avoid exposing paths. */
export function isSafeMemoryAdmissionArtifactJson(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2_000_000;
}
