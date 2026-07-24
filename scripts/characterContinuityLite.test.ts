import assert from "node:assert/strict";
import {
  buildOfflineHandoffPromptBlock,
  collectOfflineHandoffContent,
  createOfflineStoryHandoffMemory,
  filterOfflineExtractedFacts,
  sanitizeOfflineMemoryForOnlineUse,
} from "../src/domain/memory/offlineMemorySync";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { PromptComposer } from "../src/domain/prompt/PromptComposer";
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
const handoff = createOfflineStoryHandoffMemory({ story, sourceMessages: story.messages as Message[], characterId, characterName: "杨丞", id: "handoff", timestamp: 4 });

assert.ok(handoff.content.includes("水管曾出现问题"));
assert.equal(handoff.content.includes("打开工具箱"), false);
assert.equal(handoff.content.includes("小念——你过来一下"), false);
assert.equal(buildOfflineHandoffPromptBlock(handoff).includes("打开工具箱"), false);
assert.equal(buildOfflineHandoffPromptBlock(handoff).includes("小念——你过来一下"), false);
assert.equal(MemoryService.retrieveRelevantMemories({ characterId: "character-b", queryText: "水管", existingMemories: [handoff], limit: 5, scenario: "chat" }).length, 0);

const legacy = `【线下剧本《旧故事》线上交接】\n[offline-story:old:0-2]\n用户: 小念——你过来一下。\n角色: 我走到厨房打开工具箱。`;
assert.equal(sanitizeOfflineMemoryForOnlineUse(legacy).includes("打开工具箱"), false);

const gratitudeStory: OfflineStory = {
  ...story,
  id: "story-gratitude",
  messages: [
    { id: "g1", characterId, sender: "user", content: "我请杨丞和小念吃饭吧，就当谢谢你帮我修水管。", timestamp: 4, isOffline: true },
    { id: "g2", characterId, sender: "character", content: "水管已经修好了。", timestamp: 5, isOffline: true },
  ],
};
const directedFacts = collectOfflineHandoffContent(gratitudeStory, "杨丞");
assert.ok(directedFacts.includes("杨丞帮助用户修好了用户家里的水管。"));
assert.ok(directedFacts.includes("用户邀请杨丞和小念吃饭，是为了感谢杨丞的帮助。"));
assert.equal(directedFacts.includes("杨丞感谢用户"), false);
assert.deepEqual(filterOfflineExtractedFacts(["我感谢你上次的帮忙。", "杨丞帮助用户修好水管。", "杨丞感谢用户的帮忙。"]), []);
const finalMockRequest = PromptComposer.compose({ scenario: "direct-chat", message: "昨天发生什么？", history: [], systemInstruction: buildOfflineHandoffPromptBlock(createOfflineStoryHandoffMemory({ story: gratitudeStory, sourceMessages: gratitudeStory.messages, characterId, characterName: "杨丞", id: "directed", timestamp: 6 })) });
assert.ok(finalMockRequest.systemInstruction.includes("杨丞帮助用户修好了用户家里的水管。"));
assert.ok(finalMockRequest.systemInstruction.includes("用户邀请杨丞和小念吃饭，是为了感谢杨丞的帮助。"));
assert.equal(finalMockRequest.systemInstruction.includes("杨丞感谢用户"), false);

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
