import { buildDirectChatHistoryContext } from "./directChatHistoryContext";

export type DirectChatContextSnapshotInput = Parameters<typeof buildDirectChatHistoryContext>[0];
export type DirectChatContextSnapshot = ReturnType<typeof buildDirectChatHistoryContext>;

/**
 * Shared read-only context snapshot boundary for ordinary direct sends and
 * regeneration. Delivery-specific history exclusions/time formatting remain
 * explicit options so this extraction does not alter prompt semantics.
 */
export function buildDirectChatContextSnapshot(input: DirectChatContextSnapshotInput): DirectChatContextSnapshot {
  return buildDirectChatHistoryContext(input);
}
