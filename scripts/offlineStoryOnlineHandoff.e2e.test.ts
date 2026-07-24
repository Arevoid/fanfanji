import assert from "node:assert/strict";
import {
  buildOfflineHandoffPromptBlock,
  collectOfflineHandoffContent,
  createOfflineStoryHandoffMemory,
  getOfflineMemorySourceMessages,
  getOfflineStorySyncMarker,
  hasUnsyncedOfflineMemoryProgress,
} from "../src/domain/memory/offlineMemorySync";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { MemoryItem, Message, OfflineStory } from "../src/types";

const characterId = "yang-cheng";
const userEvent = "我在下班的路上碰到了杨丞，给了他一颗糖，然后和他约定晚上去他家吃饭。";
const characterEvent = "杨丞接过糖，并邀请用户晚上七点左右到家里吃饭。";

const message = (id: string, sender: Message["sender"], content: string, timestamp: number, extras: Partial<Message> = {}): Message => ({
  id, characterId, sender, content, timestamp, isOffline: true, ...extras,
});
const story = (messages: Message[], extras: Partial<OfflineStory> = {}): OfflineStory => ({
  id: "offline-handoff-001", characterId, title: "下班路上的约定", createdAt: 1, updatedAt: 4, mode: "continue", sourceChatId: characterId, messages, ...extras,
});

const currentStory = story([
  message("offline-import-1", "user", "旧线上上下文", 1, { isImportedContext: true }),
  message("user-event", "user", userEvent, 2),
  message("character-event", "character", characterEvent, 3),
]);
const sourceMessages = getOfflineMemorySourceMessages(currentStory);
const marker = getOfflineStorySyncMarker(currentStory);
const handoff = createOfflineStoryHandoffMemory({ story: currentStory, sourceMessages, characterId, id: "handoff-memory", timestamp: 5 });
const merged = MemoryService.mergeMemories([], [handoff]);
const finalMockApiRequest = {
  message: "刚才在线下发生了什么？",
  history: [],
  systemInstruction: `角色设定\n${buildOfflineHandoffPromptBlock(handoff)}`,
};

const tests: Array<[string, () => void]> = [
  ["A current story retains the user's real offline input", () => assert.equal(currentStory.messages[1].content, userEvent)],
  ["B current story retains the character continuation", () => assert.equal(currentStory.messages[2].content, characterEvent)],
  ["C imported online context is excluded", () => assert.deepEqual(sourceMessages.map((item) => item.id), ["user-event", "character-event"])],
  ["D collector keeps the user fact without replaying the transcript", () => assert.ok(collectOfflineHandoffContent(currentStory).includes("赠送糖果的互动"))],
  ["E collector keeps the dinner fact without replaying the transcript", () => assert.ok(collectOfflineHandoffContent(currentStory).includes("谈到过吃饭安排"))],
  ["F collector does not preserve screenplay dialogue", () => assert.equal(collectOfflineHandoffContent(currentStory).includes(userEvent), false)],
  ["G pending story is eligible for a handoff", () => assert.equal(hasUnsyncedOfflineMemoryProgress(currentStory), true)],
  ["H handoff records the correct character", () => assert.equal(handoff.characterId, characterId)],
  ["I handoff contains this story's marker", () => assert.ok(handoff.content.includes(marker))],
  ["J handoff contains current story facts without raw dialogue", () => assert.ok(handoff.content.includes("赠送糖果的互动") && handoff.content.includes("谈到过吃饭安排"))],
  ["K handoff does not invent the reported balcony scene", () => assert.equal(handoff.content.includes("阳台"), false)],
  ["L merge adds exactly one handoff memory", () => assert.deepEqual(merged.map((item) => item.id), ["handoff-memory"])],
  ["M marker de-duplication recognizes the persisted handoff", () => assert.equal(MemoryService.hasMarker(merged, characterId, marker), true)],
  ["N synced metadata prevents duplicate extraction", () => assert.equal(hasUnsyncedOfflineMemoryProgress({ ...currentStory, lastSyncedMessageCount: currentStory.messages.length }), false)],
  ["O another character cannot retrieve this handoff", () => assert.equal(MemoryService.retrieveRelevantMemories({ characterId: "other", queryText: "糖", existingMemories: merged, limit: 5, scenario: "chat" }).length, 0)],
  ["P the final mock API request contains the sugar fact", () => assert.ok(finalMockApiRequest.systemInstruction.includes("赠送糖果的互动"))],
  ["Q the final mock API request contains the dinner fact", () => assert.ok(finalMockApiRequest.systemInstruction.includes("谈到过吃饭安排"))],
  ["R the final mock API request excludes the invented balcony", () => assert.equal(finalMockApiRequest.systemInstruction.includes("阳台"), false)],
  ["S prompt block requires factual uncertainty instead of invention", () => assert.ok(finalMockApiRequest.systemInstruction.includes("Do not invent missing scenes"))],
  ["T one user question produces one final mock request", () => assert.equal([finalMockApiRequest].length, 1)],
];

for (const [name, run] of tests) {
  run();
  console.log(`PASS ${name}`);
}
console.log(`${tests.length} offline-to-online handoff end-to-end checks passed`);
