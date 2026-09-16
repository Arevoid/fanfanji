import assert from "node:assert/strict";
import { rankWorldBookVectorEntries, WORLD_BOOK_VECTOR_MATCH_THRESHOLD } from "../src/domain/worldbook/worldBookVector";
import { buildWorldBookSystemBlocks } from "../src/utils/worldBook";
import type { WorldBookEntry } from "../src/types";

const entry = (id: string, content: string): WorldBookEntry => ({
  id,
  title: id,
  category: "常规",
  content,
  timestamp: 1,
  triggerType: "vector",
  characterId: "global",
});

const candidates = rankWorldBookVectorEntries("我想去玫瑰花园", [
  entry("rose", "玫瑰花园位于城南，那里有一座温室"),
  entry("payment", "红包和支付规则"),
]);
assert.equal(candidates[0]?.entry.id, "rose");
assert.ok((candidates[0]?.score || 0) >= WORLD_BOOK_VECTOR_MATCH_THRESHOLD);
assert.equal(buildWorldBookSystemBlocks(
  [entry("rose", "玫瑰花园位于城南，那里有一座温室"), entry("payment", "红包和支付规则")],
  "character",
  "我想去玫瑰花园",
  { scenario: "chat", characterId: "character" },
).allTriggered.map((item) => item.id).includes("rose"), true);
assert.equal(buildWorldBookSystemBlocks(
  [entry("rose", "玫瑰花园位于城南，那里有一座温室")],
  "character",
  "今天聊聊天气",
  { scenario: "chat", characterId: "character" },
).allTriggered.length, 0);

console.log("PASS WorldBook vector triggers use deterministic semantic ranking, threshold, and top-K selection");
