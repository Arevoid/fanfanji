import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectFreshOfflineHandoffMemory } from "../src/domain/memory/offlineMemorySync";
import type { MemoryItem } from "../src/types";

const handoff: MemoryItem = {
  id: "offline-summary",
  characterId: "character-a",
  relationId: "relation-a",
  content: "【线下关键剧情归档】\n- 用户与角色确认恋爱关系。\n[offline-story:story-a:summary]",
  timestamp: 100,
};

assert.equal(selectFreshOfflineHandoffMemory({
  memories: [handoff],
  relationId: "relation-a",
  latestOnlineCharacterMessageAt: 90,
  now: 110,
}), handoff, "a handoff remains available until the character acknowledges it online");
assert.equal(selectFreshOfflineHandoffMemory({
  memories: [handoff],
  relationId: "relation-a",
  latestOnlineCharacterMessageAt: 101,
  now: 110,
}), undefined, "a later online character reply completes the handoff");
assert.equal(selectFreshOfflineHandoffMemory({
  memories: [handoff],
  relationId: "relation-b",
  latestOnlineCharacterMessageAt: 90,
  now: 110,
}), undefined, "another relationship cannot receive this offline memory");

const chatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const bridgeUses = chatSource.match(/selectFreshOfflineHandoffMemory\(\{/g) || [];
assert.equal(bridgeUses.length, 2, "normal replies and regenerated replies both receive the offline handoff");
assert.doesNotMatch(chatSource, /!relevantMemories\.some\(\(memory\) => memory\.id === latestOfflineContinuationMemory\.id\)/, "structured memory selection cannot suppress the dedicated handoff block");

console.log("PASS saved offline memory reaches the first online character reply without cross-relation leakage");
