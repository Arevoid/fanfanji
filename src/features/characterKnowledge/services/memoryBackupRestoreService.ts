import { replaceMemoryStores } from "../../../core/storage/memoryStoreTransaction";
import { storageKeys } from "../../../core/storage/storageKeys";
import { normalizeKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { normalizeConversationSummary } from "../../../core/storage/repositories/conversationSummaryRepository";
import { normalizeBehaviorCorrection } from "../../../core/storage/repositories/behaviorCorrectionRepository";
import { CHARACTER_CONTINUITY_KEY, isCharacterContinuityStore } from "../../../core/storage/repositories/characterContinuityRepository";
import { emptyCharacterContinuity } from "../../../domain/memory/characterContinuity";
import { MEMORY_ORGANIZATION_KEY, emptyMemoryOrganization, isMemoryOrganizationStore } from "./memoryOrganizationService";
import {MEMORY_MENTION_KEY} from "../../../core/storage/repositories/memoryMentionRepository";
import {invalidateMemoryCaches} from "../../../core/storage/memoryCacheInvalidation";
import {MEMORY_REVIEW_HISTORY_KEY,normalizeMemoryReviewHistory} from "./memoryPendingReviewService";
import {MEMORY_SYSTEM_KEY,type MemorySystemState} from "../../../core/storage/repositories/memorySystemRepository";

export function restoreMemoryStoreBackup(input: {
  claims: readonly unknown[]; summaries: readonly unknown[]; corrections: readonly unknown[];
  memories: readonly unknown[]; recallSettings?: unknown; continuity?: unknown; organization?: unknown; reviewActions?: unknown; memorySystem?: MemorySystemState;
}) {
  const claims = normalizeKnowledgeClaims(input.claims);
  // Reject invalid records rather than silently dropping them during a destructive restore.
  const summaries = input.summaries.map(normalizeConversationSummary);
  const corrections = input.corrections.map(normalizeBehaviorCorrection);
  const continuity = input.continuity ?? emptyCharacterContinuity();
  const organization = input.organization ?? emptyMemoryOrganization();
  const reviewActions=normalizeMemoryReviewHistory(input.reviewActions??[]);
  if(input.memorySystem&&(input.memorySystem.version!==1||!["pending","declined","accepted"].includes(input.memorySystem.choice)||typeof input.memorySystem.hasLegacy!=="boolean"))return {success:false,error:"validation" as const};
  if (!reviewActions || !isMemoryOrganizationStore(organization) || !isCharacterContinuityStore(continuity) || input.memories.some((item) => !item || typeof item !== "object"
    || typeof (item as Record<string, unknown>).id !== "string" || typeof (item as Record<string, unknown>).content !== "string")
    || claims.length !== input.claims.length || summaries.some((item) => !item) || corrections.some((item) => !item)) {
    return { success: false, error: "validation" as const };
  }
  const result=replaceMemoryStores({
    [MEMORY_MENTION_KEY]:[],
    [MEMORY_REVIEW_HISTORY_KEY]:reviewActions,
    [MEMORY_SYSTEM_KEY]:input.memorySystem??{version:1,choice:"pending",hasLegacy:claims.length>0||input.memories.length>0||summaries.length>0},
    [storageKeys.characterKnowledgeClaims]: input.memorySystem?claims:claims.map(claim=>({...claim,legacyCompatible:claim.status==="active"&&!claim.organizationOriginal&&claim.admissionStatus!=="skipped"&&(!claim.admissionStatus||!claim.valueAssessment&&claim.valueReason?.startsWith("价值尚未核实"))})),
    [storageKeys.conversationSummaries]: summaries,
    [storageKeys.behaviorCorrections]: corrections,
    [storageKeys.memoryVaultItems]: input.memories,
    [CHARACTER_CONTINUITY_KEY]: continuity,
    [MEMORY_ORGANIZATION_KEY]: organization,
      phone_memory_continuity_migration_v1: { version: 1, status: "needs_review", completed: 0,
        total: input.memories.length + claims.length, orphanIds: [], consentAt: Date.now() },
      phone_memory_continuity_legacy_snapshot_v1: { version: 1, characters: [], relationships: [], memories: input.memories, claims },
    ...(input.recallSettings ? { [storageKeys.memoryVaultSettings]: input.recallSettings } : {}),
  });
  if(result.success)invalidateMemoryCaches();
  return result;
}
