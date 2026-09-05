export const DEFAULT_CHAT_CONTEXT_MEMORY_LIMIT = 150;
export const MIN_CHAT_CONTEXT_MEMORY_LIMIT = 10;
export const MAX_CHAT_CONTEXT_MEMORY_LIMIT = 300;

export const DEFAULT_CHAT_LONG_TERM_MEMORY_LIMIT = 50;
export const MIN_CHAT_LONG_TERM_MEMORY_LIMIT = 10;
export const MAX_CHAT_LONG_TERM_MEMORY_LIMIT = 100;

/** Resolves the number of recent messages retained as short-term chat context. */
export function resolveChatContextMemoryLimit(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CHAT_CONTEXT_MEMORY_LIMIT;
  return Math.min(
    MAX_CHAT_CONTEXT_MEMORY_LIMIT,
    Math.max(MIN_CHAT_CONTEXT_MEMORY_LIMIT, Math.round(value as number)),
  );
}

/**
 * Resolves the per-character limit used when a chat turn retrieves long-term
 * memories. The value is an item-count ceiling; character budgets still keep
 * the final prompt bounded by the memory retriever.
 */
export function resolveChatLongTermMemoryLimit(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CHAT_LONG_TERM_MEMORY_LIMIT;
  return Math.min(
    MAX_CHAT_LONG_TERM_MEMORY_LIMIT,
    Math.max(MIN_CHAT_LONG_TERM_MEMORY_LIMIT, Math.round(value as number)),
  );
}
