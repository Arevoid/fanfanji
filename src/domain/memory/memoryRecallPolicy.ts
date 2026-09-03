import type { MemoryItem } from "../../types";

/**
 * Prompt budgets are deliberately measured in characters.  They are easy to
 * explain in the UI, stable across providers, and independent from a model's
 * tokenizer.  The final provider request still has its own token guard.
 */
export const DEFAULT_MEMORY_RECALL_CHARACTER_LIMIT = 4_800;
export const DEFAULT_TRUTH_PROMPT_CHARACTER_LIMIT = 6_000;

export interface MemoryRecallBudget {
  maxItems: number;
  maxCharacters?: number;
}

export const normalizeMemoryRecallBudget = (
  budget: Partial<MemoryRecallBudget> | undefined,
  fallbackItems = 5,
): MemoryRecallBudget => ({
  maxItems: Math.max(1, Math.min(50, Math.floor(budget?.maxItems ?? fallbackItems))),
  maxCharacters: budget?.maxCharacters === undefined
    ? undefined
    : Math.max(120, Math.floor(budget.maxCharacters)),
});

/**
 * Keep complete memory records whenever possible.  A single oversized newest
 * record is allowed through (and is clipped only as a last resort) so a large
 * manually confirmed fact cannot make the whole recall empty.
 */
export function selectMemoryItemsWithinBudget(
  memories: readonly MemoryItem[],
  budget: Partial<MemoryRecallBudget> | undefined,
): MemoryItem[] {
  const normalized = normalizeMemoryRecallBudget(budget, memories.length || 1);
  const candidates = memories.slice(0, normalized.maxItems);
  if (normalized.maxCharacters === undefined) return candidates;

  const selected: MemoryItem[] = [];
  let usedCharacters = 0;
  for (const memory of candidates) {
    const cost = memory.content.length;
    if (selected.length > 0 && usedCharacters + cost > normalized.maxCharacters) continue;
    selected.push(memory);
    usedCharacters += cost;
  }
  return selected;
}

export function truncatePromptText(text: string, maxCharacters: number): string {
  const limit = Math.max(0, Math.floor(maxCharacters));
  if (text.length <= limit) return text;
  if (limit <= 1) return text.slice(0, limit);
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}
