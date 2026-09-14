import {
  MEMORY_ADMISSION_CAMPAIGN_FINGERPRINT,
  MEMORY_ADMISSION_SYNTHETIC_FIXTURE_ID,
  MEMORY_ADMISSION_SYNTHETIC_PROMOTION_SCOPE,
} from "./directChatMemoryLongEvidencePersistenceProtocol";

export interface MemoryAdmissionEvidencePersistenceClientResult {
  status: "persisted" | "duplicate" | "rejected" | "conflict" | "unavailable";
  reason?: string;
  windowFingerprint: string | null;
  artifactPath: string | null;
  closurePath: string | null;
  reviewerBefore?: {
    extractionBatchCount: number;
    formalSessionCount: number;
    validControlCount: number;
    validSuppressionCount: number;
    distinctEvidenceDayCount: number;
  } | null;
  reviewerAfter?: {
    extractionBatchCount: number;
    formalSessionCount: number;
    validControlCount: number;
    validSuppressionCount: number;
    distinctEvidenceDayCount: number;
  } | null;
}

function reviewSnapshot(value: unknown): MemoryAdmissionEvidencePersistenceClientResult["reviewerAfter"] {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const fields = ["extractionBatchCount", "formalSessionCount", "validControlCount", "validSuppressionCount", "distinctEvidenceDayCount"];
  if (fields.some((field) => typeof candidate[field] !== "number")) return null;
  return {
    extractionBatchCount: candidate.extractionBatchCount as number,
    formalSessionCount: candidate.formalSessionCount as number,
    validControlCount: candidate.validControlCount as number,
    validSuppressionCount: candidate.validSuppressionCount as number,
    distinctEvidenceDayCount: candidate.distinctEvidenceDayCount as number,
  };
}

/**
 * Sends only the already-sanitized collector export to the local dev server.
 * No credentials, prompts, messages, or raw identifiers are read here.
 */
export async function persistDirectChatMemoryLongEvidenceArtifact(
  artifactJson: string,
): Promise<MemoryAdmissionEvidencePersistenceClientResult> {
  try {
    const response = await fetch("/api/dev/memory-admission/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaignFingerprint: MEMORY_ADMISSION_CAMPAIGN_FINGERPRINT,
        fixtureId: MEMORY_ADMISSION_SYNTHETIC_FIXTURE_ID,
        promotionScopeFingerprint: MEMORY_ADMISSION_SYNTHETIC_PROMOTION_SCOPE,
        artifact: artifactJson,
      }),
    });
    const payload = await response.json() as Record<string, unknown>;
    return {
      status: response.ok && ["persisted", "duplicate"].includes(String(payload.status))
        ? payload.status as MemoryAdmissionEvidencePersistenceClientResult["status"]
        : response.status === 404 ? "unavailable" : "rejected",
      ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}),
      windowFingerprint: typeof payload.windowFingerprint === "string" ? payload.windowFingerprint : null,
      artifactPath: typeof payload.artifactPath === "string" ? payload.artifactPath : null,
      closurePath: typeof payload.closurePath === "string" ? payload.closurePath : null,
      reviewerBefore: reviewSnapshot(payload.reviewerBefore),
      reviewerAfter: reviewSnapshot(payload.reviewerAfter),
    };
  } catch {
    return {
      status: "unavailable",
      reason: "persistence_endpoint_unavailable",
      windowFingerprint: null,
      artifactPath: null,
      closurePath: null,
      reviewerBefore: null,
      reviewerAfter: null,
    };
  }
}
