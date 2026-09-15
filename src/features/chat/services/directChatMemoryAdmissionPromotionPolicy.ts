/**
 * Build-time promotion contract for the first Memory Admission V2 cutover.
 *
 * The values mirror the reviewed, sanitized campaign artifact. Keeping this
 * gate immutable means a runtime caller cannot accidentally enable the
 * production brake after a partial or failed campaign. A future rollback or
 * a new campaign must ship a new policy version instead of mutating history.
 */
export const MEMORY_ADMISSION_V2_PROMOTION_POLICY_VERSION =
  "memory-admission-v2-promotion-2" as const;

export interface MemoryAdmissionV2PromotionGate {
  promotionEligible: true;
  incidents: { safety: 0; privacy: 0; accounting: 0 };
  formalSessions: 16;
  exactScopes: 4;
  automaticBatches: 20;
  validControls: 14;
  validSuppressions: 10;
  evidenceDays: 5;
}

/** Sanitized reviewer result; no prompts, message bodies, or credentials. */
export const MEMORY_ADMISSION_V2_PROMOTION_GATE: MemoryAdmissionV2PromotionGate =
  Object.freeze({
    promotionEligible: true,
    incidents: Object.freeze({ safety: 0, privacy: 0, accounting: 0 }),
    formalSessions: 16,
    exactScopes: 4,
    automaticBatches: 20,
    validControls: 14,
    validSuppressions: 10,
    evidenceDays: 5,
  });

export function isMemoryAdmissionV2PromotionGateSatisfied(): boolean {
  const gate = MEMORY_ADMISSION_V2_PROMOTION_GATE;
  return gate.promotionEligible
    && gate.incidents.safety === 0
    && gate.incidents.privacy === 0
    && gate.incidents.accounting === 0
    && gate.formalSessions >= 5
    && gate.exactScopes >= 3
    && gate.automaticBatches >= 20
    && gate.validSuppressions >= 10
    && gate.evidenceDays >= 5;
}
