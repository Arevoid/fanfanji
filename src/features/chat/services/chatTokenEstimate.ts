import type { Character, MemoryItem, Message } from "../../../types";

export interface ChatTokenEstimate {
  total: number;
  context: number;
  retrieval: number;
  persona: number;
}

export function estimateChatTokens(input: {
  character?: Character;
  relationshipCompressedMemory?: string;
  messages: readonly Message[];
  contextLimit: number;
  memories: readonly MemoryItem[];
  relationId?: string;
  isGroupChat?: boolean;
  recallCount?: number;
}): ChatTokenEstimate {
  const { character } = input;
  if (!character) return { total: 0, context: 0, retrieval: 0, persona: 0 };
  const personaLength = (character.name || "").length
    + (character.backstory || "").length
    + (character.personality || "").length
    + (input.relationshipCompressedMemory || "").length;
  const historyTextLength = input.messages.slice(-input.contextLimit).reduce((sum, message) => sum + message.content.length, 0);
  const activeMemories = input.memories.filter((memory) => input.relationId
    ? memory.relationId === input.relationId
    : memory.characterId === character.id && Boolean(input.isGroupChat));
  const memoryLength = activeMemories.slice(0, input.recallCount || 5).reduce((sum, memory) => sum + memory.content.length, 0);
  const totalChars = 1200 + personaLength + historyTextLength + memoryLength;
  const rawText = (character.backstory || "") + (character.personality || "");
  const chineseCharsCount = rawText.match(/[\u4e00-\u9fa5]/g)?.length || 0;
  const tokenEstimate = Math.round(chineseCharsCount * 1.6 + (totalChars - chineseCharsCount) * 0.5);
  return {
    total: Math.max(250, tokenEstimate),
    context: Math.round(historyTextLength * 1.6),
    retrieval: Math.round(memoryLength * 1.6),
    persona: Math.round(personaLength * 1.6),
  };
}
