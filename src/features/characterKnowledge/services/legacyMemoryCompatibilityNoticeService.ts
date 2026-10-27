import { readMemorySystem, MEMORY_SYSTEM_KEY } from "../../../core/storage/repositories/memorySystemRepository";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { loadMemories } from "../../../core/storage/repositories/memoryRepository";
import { loadConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { writeJson } from "../../../core/storage/storageAdapter";

export const LEGACY_OFFLINE_REMINDER = "如果旧线下记忆有误，建议进入线下剧情重新手动修复同步记忆。";
/** Local inspection only. No consent, model calls, or mutation of old memory data. */
export function shouldShowLegacyOfflineReminder() {
  const state = readMemorySystem();
  if (!state.valid || state.value.legacyOfflineReminderDismissed) return false;
  const claims = loadKnowledgeClaims(), memories = loadMemories([]), summaries = loadConversationSummaries();
  if (!claims.valid || !memories.valid || !summaries.valid) return false;
  return claims.value.some(claim => claim.legacyCompatible || claim.organizationOriginal || ["legacy_memory","import"].includes(claim.source.kind))
    || memories.value.some(memory => !memory.sourceKnowledgeClaimIds?.length && !memory.userIdentityId && !memory.conversationId)
    || summaries.value.some(summary => summary.generator.startsWith("legacy-"));
}
export function dismissLegacyOfflineReminder() {
  const state = readMemorySystem();
  return state.valid && writeJson(MEMORY_SYSTEM_KEY, { ...state.value, legacyOfflineReminderDismissed: true }).success;
}
