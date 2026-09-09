/**
 * Scope used by the future source-processing and projection contracts.
 * Every dimension is explicit: an empty value is never treated as a wildcard.
 */
export interface MemoryProcessingScope {
  characterId: string;
  relationId: string;
  userIdentityId: string;
  conversationId: string;
}

export type MemorySourceType = "direct_chat" | "group_chat" | "offline_story";

export type MemorySourceProcessingOutcome =
  | "skipped_low_value"
  | "extracted_zero_candidates"
  | "canonical_committed"
  | "canonical_and_projection_committed";

export interface MemorySourceProcessingCursor {
  sourceType: MemorySourceType;
  scope: MemoryProcessingScope;
  processedThroughMessageId: string;
  processedAt: number;
  processingOutcome: MemorySourceProcessingOutcome;
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function createMemoryProcessingScope(input: MemoryProcessingScope): MemoryProcessingScope {
  if (!nonEmpty(input.characterId)
    || !nonEmpty(input.relationId)
    || !nonEmpty(input.userIdentityId)
    || !nonEmpty(input.conversationId)) {
    throw new Error("memory_scope_invalid");
  }
  return {
    characterId: input.characterId.trim(),
    relationId: input.relationId.trim(),
    userIdentityId: input.userIdentityId.trim(),
    conversationId: input.conversationId.trim(),
  };
}

export function createMemorySourceProcessingCursor(input: MemorySourceProcessingCursor): MemorySourceProcessingCursor {
  if (!["direct_chat", "group_chat", "offline_story"].includes(input.sourceType)
    || !nonEmpty(input.processedThroughMessageId)
    || !Number.isFinite(input.processedAt)
    || input.processedAt < 0
    || !["skipped_low_value", "extracted_zero_candidates", "canonical_committed", "canonical_and_projection_committed"].includes(input.processingOutcome)) {
    throw new Error("memory_source_cursor_invalid");
  }
  return {
    sourceType: input.sourceType,
    scope: createMemoryProcessingScope(input.scope),
    processedThroughMessageId: input.processedThroughMessageId.trim(),
    processedAt: input.processedAt,
    processingOutcome: input.processingOutcome,
  };
}

/** Stable scope key for future dedup/version comparisons; it contains IDs only. */
export function getMemoryProcessingScopeKey(scope: MemoryProcessingScope): string {
  const normalized = createMemoryProcessingScope(scope);
  return [normalized.characterId, normalized.relationId, normalized.userIdentityId, normalized.conversationId]
    .map((part) => encodeURIComponent(part))
    .join("|");
}
