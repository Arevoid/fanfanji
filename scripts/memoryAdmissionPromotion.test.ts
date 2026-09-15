import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getMemoryAdmissionV2PromotionState,
  initializeMemoryAdmissionV2Promotion,
  isMemoryAdmissionV2Promoted,
  promoteMemoryAdmissionV2,
  rollbackMemoryAdmissionV2,
  MEMORY_ADMISSION_V2_PROMOTION_GATE,
  MEMORY_ADMISSION_V2_PROMOTION_POLICY_VERSION,
} from "../src/features/chat/services/directChatMemoryAdmissionPromotion";
import { isDirectChatMemorySafetyVetoCanaryEnabled } from "../src/features/chat/services/directChatMemorySafetyVetoCanary";
import { isDirectChatMemorySafetyVetoShadowEnabled } from "../src/features/chat/services/directChatMemorySafetyVetoShadow";

assert.equal(MEMORY_ADMISSION_V2_PROMOTION_POLICY_VERSION, "memory-admission-v2-promotion-2");
assert.equal(MEMORY_ADMISSION_V2_PROMOTION_GATE.promotionEligible, true);
assert.equal(MEMORY_ADMISSION_V2_PROMOTION_GATE.incidents.safety, 0);
assert.equal(MEMORY_ADMISSION_V2_PROMOTION_GATE.incidents.privacy, 0);
assert.equal(MEMORY_ADMISSION_V2_PROMOTION_GATE.incidents.accounting, 0);
assert.match(
  readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8"),
  /initializeMemoryAdmissionV2Promotion\(\)/u,
  "the application entrypoint must initialize the reviewed promotion",
);

rollbackMemoryAdmissionV2();
assert.equal(isMemoryAdmissionV2Promoted(), false, "rollback starts in legacy-safe mode");
assert.equal(isDirectChatMemorySafetyVetoCanaryEnabled(), false);
assert.equal(isDirectChatMemorySafetyVetoShadowEnabled(), false);

assert.equal(promoteMemoryAdmissionV2(), true, "reviewed gate enables the production brake");
assert.equal(isMemoryAdmissionV2Promoted(), true);
assert.equal(isDirectChatMemorySafetyVetoCanaryEnabled(), true);
assert.equal(isDirectChatMemorySafetyVetoShadowEnabled(), true);
assert.deepEqual(getMemoryAdmissionV2PromotionState(), {
  policyVersion: "memory-admission-v2-promotion-2",
  promotionEligible: true,
  promoted: true,
  safetyVetoEnabled: true,
  rollbackAvailable: true,
});

rollbackMemoryAdmissionV2();
assert.equal(getMemoryAdmissionV2PromotionState().promoted, false);
assert.equal(getMemoryAdmissionV2PromotionState().rollbackAvailable, true);

const initialized = initializeMemoryAdmissionV2Promotion();
assert.equal(initialized.promoted, true, "application initialization restores the reviewed state");
assert.equal(initialized.policyVersion, "memory-admission-v2-promotion-2");

rollbackMemoryAdmissionV2();
console.log("memory admission V2 promotion gate, production enablement and rollback passed");
