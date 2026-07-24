import assert from "node:assert/strict";
import {
  buildOfflineHandoffPromptBlock,
  createOfflineStoryHandoffMemory,
  sanitizeOfflineMemoryForOnlineUse,
} from "../src/domain/memory/offlineMemorySync";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { describeHistoricalRelativeTime, formatHistoricalMessageForPrompt } from "../src/domain/prompt/historyTimeContext";
import type { Message, OfflineStory } from "../src/types";

const characterId = "character-a";
const story: OfflineStory = {
  id: "story-water-pipe", characterId, title: "修水管", createdAt: 1, updatedAt: 3, mode: "continue",
  messages: [
    { id: "1", characterId, sender: "user", content: "我家水管漏水了。", timestamp: 1, isOffline: true },
    { id: "2", characterId, sender: "character", content: "我走到厨房打开工具箱，然后叫小念过来。", timestamp: 2, isOffline: true },
    { id: "3", characterId, sender: "character", content: "小念——你过来一下。", timestamp: 3, isOffline: true },
  ],
};
const handoff = createOfflineStoryHandoffMemory({ story, sourceMessages: story.messages as Message[], characterId, id: "handoff", timestamp: 4 });

assert.ok(handoff.content.includes("水管漏水"));
assert.equal(handoff.content.includes("打开工具箱"), false);
assert.equal(handoff.content.includes("小念——你过来一下"), false);
assert.equal(buildOfflineHandoffPromptBlock(handoff).includes("打开工具箱"), false);
assert.equal(buildOfflineHandoffPromptBlock(handoff).includes("小念——你过来一下"), false);
assert.equal(MemoryService.retrieveRelevantMemories({ characterId: "character-b", queryText: "水管", existingMemories: [handoff], limit: 5, scenario: "chat" }).length, 0);

const legacy = `【线下剧本《旧故事》线上交接】\n[offline-story:old:0-2]\n用户: 小念——你过来一下。\n角色: 我走到厨房打开工具箱。`;
assert.equal(sanitizeOfflineMemoryForOnlineUse(legacy).includes("打开工具箱"), false);

const friday = new Date(2026, 6, 24, 12, 0);
const wednesday = new Date(2026, 6, 22, 21, 55).getTime();
assert.ok(describeHistoricalRelativeTime("明天一起吃饭", wednesday, friday).includes("2026年7月23日星期四"));
assert.ok(describeHistoricalRelativeTime("明天一起吃饭", wednesday, friday).includes("已过去"));
const thursday = new Date(2026, 6, 23, 12, 0);
assert.ok(describeHistoricalRelativeTime("明天见", wednesday, thursday).includes("就是今天，仍可能有效"));
assert.ok(formatHistoricalMessageForPrompt("明天一起吃饭", wednesday, friday).includes("历史发送时间"));

const offlineExtraction = await MemoryService.extractMemories({
  character: { id: characterId, name: "A", avatar: "", personality: "", backstory: "" },
  characterId,
  recentMessages: story.messages,
  existingMemories: [],
  scenario: "offline",
  apiKey: "",
  model: "",
  createId: () => "offline-event",
  currentTime: () => 5,
  formatContent: (items) => items.join("；"),
}, async () => ({ items: ["角色协助用户处理水管漏水。"] }));
assert.equal(offlineExtraction.extractedMemories[0]?.importance, 4, "线下短期事件应低于默认长期事实的重要度");

console.log("PASS offline screenplay isolation, legacy handoff sanitization, character isolation, relative-time resolution, and short-term event weighting");
