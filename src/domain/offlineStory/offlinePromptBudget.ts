import type { PromptHistoryEntry } from "../prompt/promptTypes";

/**
 * Provider tokenizers differ, so the offline writer uses a conservative,
 * deterministic estimate instead of pretending that character count is an
 * exact token count. CJK characters are close to one token; latin text is
 * estimated at roughly four characters per token.
 */
export function estimatePromptTokens(text: string): number {
  const cjkCharacters = (text.match(/[\u3400-\u9fff\u3040-\u30ff]/gu) || []).length;
  const otherCharacters = Math.max(0, text.length - cjkCharacters);
  return Math.ceil(cjkCharacters + otherCharacters / 4);
}

/** Keep both the beginning (rules/persona) and the end (latest instructions). */
export function truncatePromptTextKeepingEdges(text: string, maxCharacters: number): string {
  const limit = Math.max(0, Math.floor(maxCharacters));
  if (text.length <= limit) return text;
  if (limit <= 2) return text.slice(0, limit);
  const head = Math.ceil(limit * 0.58);
  const tail = Math.max(0, limit - head);
  return `${text.slice(0, head).trimEnd()}\n\n【中间上下文已压缩，完整内容仍保存在本地】\n\n${text.slice(-tail).trimStart()}`;
}

export function truncatePromptTextToEstimatedTokens(text: string, maxTokens: number): string {
  const tokenLimit = Math.max(1, Math.floor(maxTokens));
  if (estimatePromptTokens(text) <= tokenLimit) return text;
  let low = 1;
  let high = text.length;
  let best = "";
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = truncatePromptTextKeepingEdges(text, middle);
    if (estimatePromptTokens(candidate) <= tokenLimit) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best || text.slice(0, Math.max(1, Math.floor(tokenLimit * 0.8)));
}

export interface OfflinePromptBudgetOptions {
  /** Total estimated input-token budget, excluding the provider output. */
  maxInputTokens?: number;
  /** Reserve this many tokens for the current user instruction. */
  maxMessageTokens?: number;
  /** Reserve this many tokens for the system/persona rules. */
  maxSystemTokens?: number;
}

export interface BoundedOfflinePrompt {
  history: PromptHistoryEntry[];
  systemInstruction: string;
  message: string;
  historyWasTrimmed: boolean;
  systemWasTrimmed: boolean;
  messageWasTrimmed: boolean;
}

function takeNewestHistoryWithinBudget(history: readonly PromptHistoryEntry[], maxTokens: number) {
  const selected: PromptHistoryEntry[] = [];
  let usedTokens = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    const cost = Math.max(1, estimatePromptTokens(entry.text));
    if (selected.length > 0 && usedTokens + cost > maxTokens) break;
    if (selected.length === 0 && cost > maxTokens) {
      selected.unshift({ ...entry, text: truncatePromptTextToEstimatedTokens(entry.text, maxTokens) });
      usedTokens = maxTokens;
      break;
    }
    selected.unshift({ ...entry });
    usedTokens += cost;
  }
  const omitted = history.length - selected.length;
  if (omitted > 0) {
    const omittedEntries = history.slice(0, omitted);
    const sampleIndexes = omittedEntries.length <= 4
      ? omittedEntries.map((_entry, index) => index)
      : [0, 1, omittedEntries.length - 2, omittedEntries.length - 1];
    const excerpts = sampleIndexes
      .map((index) => omittedEntries[index])
      .filter(Boolean)
      .map((entry) => `${entry.role}: ${truncatePromptTextToEstimatedTokens(entry.text, 80)}`)
      .join("\n");
    selected.unshift({
      role: "system",
      text: `【较早剧情已压缩】已省略 ${omitted} 条较早记录。以下仅保留早期剧情的少量摘录，完整剧情仍保存在本地；请以最近记录和本轮输入为准。\n${excerpts}`,
    });
  }
  return { history: selected, omitted };
}

/**
 * Bounds the prompt projection only. The original story messages are never
 * deleted, rewritten, or migrated by this helper.
 */
export function boundOfflinePrompt(
  input: { history: readonly PromptHistoryEntry[]; systemInstruction: string; message: string },
  options: OfflinePromptBudgetOptions = {},
): BoundedOfflinePrompt {
  const maxInputTokens = Math.max(4_000, Math.floor(options.maxInputTokens ?? 12_000));
  const maxMessageTokens = Math.max(200, Math.min(maxInputTokens - 1_000, Math.floor(options.maxMessageTokens ?? 1_200)));
  const maxSystemTokens = Math.max(1_000, Math.min(maxInputTokens - maxMessageTokens - 500, Math.floor(options.maxSystemTokens ?? 6_500)));
  const message = truncatePromptTextToEstimatedTokens(input.message, maxMessageTokens);
  const systemInstruction = truncatePromptTextToEstimatedTokens(input.systemInstruction, maxSystemTokens);
  const historyBudget = Math.max(1_000, maxInputTokens - estimatePromptTokens(message) - estimatePromptTokens(systemInstruction));
  const boundedHistory = takeNewestHistoryWithinBudget(input.history, historyBudget);
  return {
    history: boundedHistory.history,
    systemInstruction,
    message,
    historyWasTrimmed: boundedHistory.omitted > 0,
    systemWasTrimmed: systemInstruction !== input.systemInstruction,
    messageWasTrimmed: message !== input.message,
  };
}
