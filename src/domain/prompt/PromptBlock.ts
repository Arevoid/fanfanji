export type PromptBlockKind =
  | "platform"
  | "user-persona"
  | "char-description"
  | "char-personality"
  | "relationship"
  | "world-book"
  | "memory"
  | "context"
  | "format"
  | "task";

export interface PromptBlock {
  id: string;
  kind: PromptBlockKind;
  content: string;
  /** Stable source identity used to prevent the same material being injected twice. */
  sourceId?: string;
}

export interface PromptBlockDiagnostic {
  id: string;
  kind: PromptBlockKind;
  sourceId?: string;
  characters: number;
  estimatedTokens: number;
}

export interface PromptAssemblyDiagnostics {
  blocks: PromptBlockDiagnostic[];
  duplicateBlockIds: string[];
  duplicateSourceIds: string[];
  duplicateContentBlockIds: string[];
  estimatedTokens: number;
}

export interface PromptAssemblyResult {
  systemInstruction: string;
  diagnostics: PromptAssemblyDiagnostics;
}

export function estimatePromptTokens(text: string): number {
  if (!text) return 0;
  const chineseCharacters = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  return Math.round(chineseCharacters * 1.5 + (text.length - chineseCharacters) * 0.4);
}

/**
 * Keeps caller order while removing duplicate blocks and duplicate stable
 * sources. Exact duplicate content is also removed as a final safety net.
 */
export function assemblePromptBlocks(blocks: readonly PromptBlock[]): PromptAssemblyResult {
  const accepted: PromptBlock[] = [];
  const seenIds = new Set<string>();
  const seenSources = new Set<string>();
  const seenContent = new Set<string>();
  const duplicateBlockIds = new Set<string>();
  const duplicateSourceIds = new Set<string>();
  const duplicateContentBlockIds = new Set<string>();

  blocks.forEach((block) => {
    const content = block.content.trim();
    if (!content) return;
    if (seenIds.has(block.id)) {
      duplicateBlockIds.add(block.id);
      return;
    }
    if (block.sourceId && seenSources.has(block.sourceId)) {
      duplicateSourceIds.add(block.sourceId);
      return;
    }
    if (seenContent.has(content)) {
      duplicateContentBlockIds.add(block.id);
      return;
    }

    seenIds.add(block.id);
    if (block.sourceId) seenSources.add(block.sourceId);
    seenContent.add(content);
    accepted.push({ ...block, content });
  });

  const diagnostics = accepted.map((block) => ({
    id: block.id,
    kind: block.kind,
    sourceId: block.sourceId,
    characters: block.content.length,
    estimatedTokens: estimatePromptTokens(block.content),
  }));

  return {
    systemInstruction: accepted.map((block) => block.content).join("\n\n---\n\n"),
    diagnostics: {
      blocks: diagnostics,
      duplicateBlockIds: [...duplicateBlockIds],
      duplicateSourceIds: [...duplicateSourceIds],
      duplicateContentBlockIds: [...duplicateContentBlockIds],
      estimatedTokens: diagnostics.reduce((sum, block) => sum + block.estimatedTokens, 0),
    },
  };
}
