import { assemblePromptBlocks, type PromptBlock, type PromptBlockKind } from "../../../domain/prompt/PromptBlock";

/**
 * Converts the direct-chat instruction list into typed prompt blocks and lets
 * the shared assembler remove duplicate role/personality content.
 */
export const assembleChatInstructions = (
  instructions: readonly string[],
  knownBlocks: readonly PromptBlock[],
) => {
  const knownByContent = new Map(knownBlocks.map((block) => [block.content.trim(), block]));
  const blocks = instructions.map((content, index): PromptBlock => {
    const known = knownByContent.get(content.trim());
    return known || {
      id: `chat-instruction-${index}`,
      kind: "context" as PromptBlockKind,
      content,
    };
  });
  return assemblePromptBlocks(blocks);
};
