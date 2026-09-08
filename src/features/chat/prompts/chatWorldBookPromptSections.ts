import type { WorldBookSystemBlocks } from "../../../utils/worldBook";

export type StructuralWorldBookPosition = "after_main_prompt" | "before_char_def" | "after_char_def" | "before_chat_history";

const LABELS: Record<StructuralWorldBookPosition, string> = {
  after_main_prompt: "World Book Background: Main Prompt Extensions",
  before_char_def: "World Book Background: Context Primers",
  after_char_def: "World Book Background: Profile Extensions",
  before_chat_history: "World Book Background: Story Anchor",
};

/** Formats one structural slot without changing its order or content. */
export function formatStructuralWorldBookSection(blocks: WorldBookSystemBlocks, position: StructuralWorldBookPosition): string {
  const values = blocks[position];
  return values.length ? `[${LABELS[position]}]\n${values.join("\n\n")}` : "";
}
