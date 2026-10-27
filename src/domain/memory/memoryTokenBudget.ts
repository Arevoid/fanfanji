/** UTF-8 bytes give a conservative token upper bound without pretending to know a custom provider's tokenizer. */
export const DEFAULT_MEMORY_TOKEN_UPPER_BOUND = 3000;
export const memoryTokenUpperBound = (text: string): number => new TextEncoder().encode(text).length;
export function fitsMemoryTokenBudget(text: string, tokens: number): boolean {
  return memoryTokenUpperBound(text) <= Math.max(0, Math.floor(tokens));
}
/** Whole structured records only; no partial evidence or half a life step enters a prompt. */
export function selectStructuredMemoryRecords<T>(records: readonly T[], byteBudget: number): T[] {
  const selected: T[] = []; let used = 2;
  for (const record of records) {
    const cost = memoryTokenUpperBound(JSON.stringify(record)) + 1;
    if (used + cost <= byteBudget) { selected.push(record); used += cost; }
  }
  return selected;
}
