import assert from "node:assert/strict";
import { buildWorldBookSystemBlocks, WORLD_BOOK_ENTRY_MAX_CHARS, WORLD_BOOK_TOTAL_MAX_CHARS } from "../src/utils/worldBook";
import type { WorldBookEntry } from "../src/types";

const entries: WorldBookEntry[] = Array.from({ length: 12 }, (_, index) => ({
  id: `budget-${index}`,
  title: `预算词条${index}`,
  category: "常规",
  content: "x".repeat(4000),
  timestamp: index + 1,
  triggerType: "constant",
  position: index % 2 === 0 ? "after_char_def" : "at_depth",
  depth: index + 1,
  characterId: "global",
}));
const blocks = buildWorldBookSystemBlocks(entries, "character", "", { scenario: "chat", characterId: "character" });
assert.ok(blocks.allTriggered.length < entries.length);
assert.ok(blocks.formattedAll.length <= WORLD_BOOK_TOTAL_MAX_CHARS + 200);
for (const section of [blocks.after_main_prompt, blocks.before_char_def, blocks.after_char_def, blocks.before_chat_history]) {
  for (const value of section) assert.ok(value.length <= WORLD_BOOK_ENTRY_MAX_CHARS + 80);
}
for (const injection of blocks.at_depth) assert.ok(injection.content.length <= WORLD_BOOK_ENTRY_MAX_CHARS + 80);

console.log("PASS WorldBook injection budgets cap per-entry and total prompt growth");
