import type { MemoryItem } from "../../types";

export interface OocCorrectionMemoryInput {
  id: string;
  characterId: string;
  relationId: string;
  originalResponse: string;
  feedback: string;
  timestamp: number;
}

/**
 * OOC corrections are relationship-scoped by definition. Keeping creation in
 * a small pure helper prevents a caller from accidentally creating a new
 * character-wide correction record.
 */
export function createOocCorrectionMemory(input: OocCorrectionMemoryInput): MemoryItem {
  if (!input.relationId.trim()) {
    throw new Error("OOC correction memory requires relationId");
  }

  return {
    id: input.id,
    characterId: input.characterId,
    relationId: input.relationId,
    content: `[OOC 修正记录] 原回答：“${input.originalResponse}” 被指出不符合人设。用户修正意见：${input.feedback}`,
    timestamp: input.timestamp,
    importance: 8,
  };
}
