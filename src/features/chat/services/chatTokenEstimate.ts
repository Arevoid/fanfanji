import type { Character, MemoryItem, Message } from "../../../types";
import { DEFAULT_MEMORY_RECALL_CHARACTER_LIMIT, selectMemoryItemsWithinBudget } from "../../../domain/memory/MemoryService";

export interface ChatTokenEstimate {
  total: number;
  context: number;
  retrieval: number;
  persona: number;
}

export interface ChatPromptHistoryTurn {
  role: string;
  text: string;
}

/**
 * This is deliberately a provider-neutral estimate. A provider tokenizer is
 * still the authority, but keeping this function shared by preview and the
 * assembled request prevents the UI from silently ignoring prompt sections.
 */
export function estimatePromptTextTokens(text: string): number {
  const normalized = text || "";
  const chineseCharsCount = normalized.match(/[\u4e00-\u9fa5]/g)?.length || 0;
  return Math.round(chineseCharsCount * 1.6 + (normalized.length - chineseCharsCount) * 0.5);
}

export function estimateChatRequestTokens(input: {
  systemInstruction: string;
  history: readonly ChatPromptHistoryTurn[];
  message: string;
  historyInjections?: readonly { content: string }[];
  retrievalText?: string;
  /** Set when retrievalText is already part of systemInstruction. */
  retrievalIncludedInSystem?: boolean;
  hasImage?: boolean;
}): ChatTokenEstimate {
  const historyText = input.history.map((turn) => `${turn.role}: ${turn.text}`).join("\n");
  const historyInjectionText = (input.historyInjections || []).map((entry) => entry.content).join("\n");
  const systemTokens = estimatePromptTextTokens(input.systemInstruction);
  const contextTokens = estimatePromptTextTokens(`${historyText}\n${input.message}`);
  const injectionTokens = estimatePromptTextTokens(historyInjectionText);
  const imageTokens = input.hasImage ? 768 : 0;
  const envelopeTokens = 16 + input.history.length * 4;
  const retrievalTokens = estimatePromptTextTokens(input.retrievalText || "");
  // AppChat already appends the retrieval block into systemInstruction. Keep
  // retrieval in the breakdown, but only add it to the total when a caller
  // supplied it separately; this prevents both under-counting and double-counting.
  const retrievalIncludedInSystem = input.retrievalIncludedInSystem ?? (Boolean(input.retrievalText?.trim())
    && input.systemInstruction.includes(input.retrievalText!.trim()));
  const standaloneRetrievalTokens = retrievalIncludedInSystem ? 0 : retrievalTokens;
  const total = Math.max(250, systemTokens + contextTokens + injectionTokens + standaloneRetrievalTokens + imageTokens + envelopeTokens);
  return {
    total,
    context: contextTokens,
    retrieval: retrievalTokens,
    persona: Math.max(0, systemTokens - (retrievalIncludedInSystem ? retrievalTokens : 0)),
  };
}

export function estimateChatTokens(input: {
  character?: Character;
  relationshipCompressedMemory?: string;
  messages: readonly Message[];
  contextLimit: number;
  memories: readonly MemoryItem[];
  relationId?: string;
  userIdentityId?: string;
  isGroupChat?: boolean;
  recallCount?: number;
  /** Additional dynamic prompt blocks available to the settings preview. */
  additionalPromptText?: string;
  /** The exact long-term prompt projection available to the settings preview. */
  retrievalText?: string;
  /** Optional unsent user text; omitted when the composer keeps it local. */
  currentMessageText?: string;
}): ChatTokenEstimate {
  const { character } = input;
  if (!character) return { total: 0, context: 0, retrieval: 0, persona: 0 };
  const personaText = [
    character.name,
    character.remark,
    character.age,
    character.gender,
    character.personality,
    character.backstory,
    input.relationshipCompressedMemory,
  ].filter(Boolean).join("\n");
  const historyText = input.messages.slice(-input.contextLimit).map((message) => message.content).join("\n");
  const historyTextLength = historyText.length;
  const activeMemories = input.memories.filter((memory) =>
    memory.characterId === character.id
    && (input.relationId ? memory.relationId === input.relationId : Boolean(input.isGroupChat) && !memory.relationId)
    && (!input.userIdentityId || !memory.userIdentityId || memory.userIdentityId === input.userIdentityId)
    && !memory.sourceKnowledgeClaimIds?.length,
  );
  const selectedMemories = selectMemoryItemsWithinBudget(activeMemories, {
    maxItems: input.recallCount ?? 5,
    maxCharacters: DEFAULT_MEMORY_RECALL_CHARACTER_LIMIT,
  });
  const memoryText = input.retrievalText?.trim() || selectedMemories.map((memory) => memory.content).join("\n");
  const contextText = [historyText, input.currentMessageText || ""].filter(Boolean).join("\n");
  const tokenEstimate = estimatePromptTextTokens([
    "[prompt envelope]",
    personaText,
    input.additionalPromptText || "",
    contextText,
    memoryText,
  ].join("\n"));
  return {
    total: Math.max(250, tokenEstimate),
    context: estimatePromptTextTokens(contextText),
    retrieval: estimatePromptTextTokens(memoryText),
    persona: estimatePromptTextTokens(`${personaText}\n${input.additionalPromptText || ""}`),
  };
}
