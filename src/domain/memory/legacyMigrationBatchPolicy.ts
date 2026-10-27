/** Original source text budget; instructions and scoped settings are additional. */
import type { KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
export const LEGACY_MIGRATION_BATCH_SOURCES = 60;
export const LEGACY_MIGRATION_BATCH_CHARACTERS = 24_000;
export const LEGACY_MIGRATION_MAX_RESULT_ITEMS = 120;
export const LEGACY_MIGRATION_MAX_OUTPUT_TOKENS = 16_384;
export const LEGACY_MIGRATION_COMPACT_OUTPUT_RULE = "本次迁移大批次优先每来源1条重点，确有不同重要信息最多2条，全部items最多120条；不逐句生成。优先保留否定、条件、约定与真实变化，不为凑数新增记忆。未返回的来源继续保留旧方式，不追加请求补齐。";

/** Reuse text analysis only; originals, provenance and derived IDs stay independent. */
export function legacyMigrationContentKey(claim: KnowledgeClaim, offset = 0) {
  return JSON.stringify([claim.characterId,claim.userIdentityId,claim.relationId,claim.conversationId,
    claim.statement,offset,claim.kind,claim.subject,claim.temporalStatus,claim.occurredAt,claim.truthStatus,
    claim.userConfirmed,claim.confidence,claim.visibility,claim.admissionStatus,claim.importance,
    claim.validFrom,claim.validTo,claim.planStatus,claim.semantics,claim.source.statementAt,
    claim.source.kind,claim.source.authorship,claim.source.app,claim.source.interpretation]);
}

/** Leave small batches at the existing output ceiling. Never retries a rejected limit. */
export function legacyMigrationOutputTokens(sourceCount: number, characters: number) {
  return sourceCount > 20 || characters > 6000 ? LEGACY_MIGRATION_MAX_OUTPUT_TOKENS : 8192;
}
