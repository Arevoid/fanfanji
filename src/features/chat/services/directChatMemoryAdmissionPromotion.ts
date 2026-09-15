import {
  configureDirectChatMemorySafetyVetoCanary,
  ENABLED_DIRECT_CHAT_MEMORY_SAFETY_VETO_CANARY_REASONS,
  isDirectChatMemorySafetyVetoCanaryEnabled,
} from "./directChatMemorySafetyVetoCanary";
import {
  configureDirectChatMemorySafetyVetoShadow,
  isDirectChatMemorySafetyVetoShadowEnabled,
} from "./directChatMemorySafetyVetoShadow";
import {
  isMemoryAdmissionV2PromotionGateSatisfied,
  MEMORY_ADMISSION_V2_PROMOTION_GATE,
  MEMORY_ADMISSION_V2_PROMOTION_POLICY_VERSION,
} from "./directChatMemoryAdmissionPromotionPolicy";

export {
  isMemoryAdmissionV2PromotionGateSatisfied,
  MEMORY_ADMISSION_V2_PROMOTION_GATE,
  MEMORY_ADMISSION_V2_PROMOTION_POLICY_VERSION,
};

let rollbackRequested = false;

export interface MemoryAdmissionV2PromotionState {
  policyVersion: typeof MEMORY_ADMISSION_V2_PROMOTION_POLICY_VERSION;
  promotionEligible: boolean;
  promoted: boolean;
  safetyVetoEnabled: boolean;
  rollbackAvailable: true;
}

/**
 * Enable the reviewed cancelled-plan Safety-veto brake on the normal Direct
 * Chat path. The legacy writer remains the sole canonical writer; V2 only
 * filters a candidate that satisfies every existing fail-closed gate.
 */
export function promoteMemoryAdmissionV2(): boolean {
  if (!isMemoryAdmissionV2PromotionGateSatisfied()) {
    rollbackRequested = true;
    configureDirectChatMemorySafetyVetoCanary({ enabled: false });
    configureDirectChatMemorySafetyVetoShadow({ enabled: false });
    return false;
  }

  rollbackRequested = false;
  configureDirectChatMemorySafetyVetoCanary({
    enabled: true,
    productionPolicy: MEMORY_ADMISSION_V2_PROMOTION_POLICY_VERSION,
    enabledReasons: ENABLED_DIRECT_CHAT_MEMORY_SAFETY_VETO_CANARY_REASONS,
  });
  configureDirectChatMemorySafetyVetoShadow({
    enabled: true,
    productionPolicy: MEMORY_ADMISSION_V2_PROMOTION_POLICY_VERSION,
  });
  return isMemoryAdmissionV2Promoted();
}

/** Disable only the promoted brake. Existing canonical data remains readable. */
export function rollbackMemoryAdmissionV2(): void {
  rollbackRequested = true;
  configureDirectChatMemorySafetyVetoCanary({ enabled: false });
  configureDirectChatMemorySafetyVetoShadow({ enabled: false });
}

export function isMemoryAdmissionV2Promoted(): boolean {
  return !rollbackRequested
    && isMemoryAdmissionV2PromotionGateSatisfied()
    && isDirectChatMemorySafetyVetoCanaryEnabled()
    && isDirectChatMemorySafetyVetoShadowEnabled();
}

export function getMemoryAdmissionV2PromotionState(): MemoryAdmissionV2PromotionState {
  return {
    policyVersion: MEMORY_ADMISSION_V2_PROMOTION_POLICY_VERSION,
    promotionEligible: isMemoryAdmissionV2PromotionGateSatisfied(),
    promoted: isMemoryAdmissionV2Promoted(),
    safetyVetoEnabled: isDirectChatMemorySafetyVetoCanaryEnabled(),
    rollbackAvailable: true,
  };
}

/** Called once from the application entrypoint; safe to call again after HMR. */
export function initializeMemoryAdmissionV2Promotion(): MemoryAdmissionV2PromotionState {
  promoteMemoryAdmissionV2();
  return getMemoryAdmissionV2PromotionState();
}
