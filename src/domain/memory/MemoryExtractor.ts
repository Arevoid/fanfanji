import type { MemoryItem } from "../../types";
import { isDuplicateMemory } from "./MemoryDeduplicator";
import type { MemoryExtractionApi, MemoryExtractionContext } from "./memoryTypes";

export async function extractMemories(
  context: MemoryExtractionContext,
  extractApi: MemoryExtractionApi,
): Promise<{ extractedMemories: MemoryItem[]; apiError?: string }> {
  const history = context.recentMessages.map((message) => ({
    role: message.sender === "user" ? "user" as const : "model" as const,
    text: message.content,
  }));
  const data = await extractApi({
    history,
    characterName: context.character.name,
    apiKey: context.apiKey,
    model: context.model,
    apiEndpoint: context.apiEndpoint,
    templateType: context.templateType,
  });

  if (!Array.isArray(data.items)) {
    return { extractedMemories: [], apiError: data.error || "提炼失败，未提取到有效记忆或API请求出错" };
  }
  const validItems = data.items.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (validItems.length === 0) return { extractedMemories: [] };

  const candidate: MemoryItem = {
    id: context.createId(),
    characterId: context.characterId,
    ...(context.relationId ? { relationId: context.relationId } : {}),
    content: context.formatContent(validItems),
    timestamp: context.currentTime(),
    // Offline extraction records a recent event, not a permanent personality
    // fact. Existing memories retain their stored importance unchanged.
    importance: context.scenario === "offline" ? 4 : 5,
    isManual: false,
  };
  return isDuplicateMemory(context.existingMemories, candidate)
    ? { extractedMemories: [] }
    : { extractedMemories: [candidate] };
}
