import assert from "node:assert/strict";
import { createOfflineStoryHandoffMemory, getOfflineMemorySourceMessages, hasUnsyncedOfflineMemoryProgress } from "../src/domain/memory/offlineMemorySync";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character, Message, OfflineStory } from "../src/types";

const message = (id: string, content: string, extras: Partial<Message> = {}): Message => ({
  id, characterId: "a", sender: "user", content, timestamp: 1, ...extras,
});
const story = (messages: Message[], extras: Partial<OfflineStory> = {}): OfflineStory => ({
  id: "story-a", characterId: "a", title: "测试", createdAt: 1, updatedAt: 1, mode: "continue", messages, ...extras,
});
const character: Character = { id: "a", name: "A", avatar: "", personality: "", backstory: "" };
const tests: Array<[string, () => void | Promise<void>]> = [
  ["A importedContext is excluded", () => assert.deepEqual(getOfflineMemorySourceMessages(story([message("old", "old", { isImportedContext: true }), message("new", "new")])).map((item) => item.id), ["new"])],
  ["B new plot is retained", () => assert.equal(getOfflineMemorySourceMessages(story([message("new", "约定明天见")])).length, 1)],
  ["C blank and narration are excluded", () => assert.equal(getOfflineMemorySourceMessages(story([message("blank", "  "), message("n", "旁白", { isNarration: true })])).length, 0)],
  ["D synced story has no pending progress", () => assert.equal(hasUnsyncedOfflineMemoryProgress(story([message("new", "x")], { lastSyncedMessageCount: 1, memorySyncStatus: "synced" })), false)],
  ["E re-entered synced story stays unsynced-free", () => assert.equal(hasUnsyncedOfflineMemoryProgress(story([message("new", "x")], { archivedAt: 1 })), false)],
  ["F failed story remains retryable", () => assert.equal(hasUnsyncedOfflineMemoryProgress(story([message("new", "x")], { memorySyncStatus: "failed" })), true)],
  ["G failed sync leaves source records intact", () => assert.equal(getOfflineMemorySourceMessages(story([message("new", "x")], { memorySyncStatus: "failed" }))[0].id, "new")],
  ["H retry uses the same new records", () => assert.deepEqual(getOfflineMemorySourceMessages(story([message("old", "x"), message("new", "y")], { lastSyncedMessageCount: 1 })).map((item) => item.id), ["new"])],
  ["I character boundary is represented by the caller characterId", async () => {
    const result = await MemoryService.extractMemories({ character, characterId: "a", recentMessages: [message("new", "约定")], existingMemories: [], scenario: "offline", apiKey: "", model: "", createId: () => "memory-a", currentTime: () => 1, formatContent: (items) => items.join(";") }, async () => ({ items: ["约定"] }));
    assert.equal(result.extractedMemories[0]?.characterId, "a");
  }],
  ["J legacy story remains readable", () => assert.equal(hasUnsyncedOfflineMemoryProgress(story([message("new", "x")])), true)],
  ["K extraction result can merge without reload", () => assert.equal(MemoryService.mergeMemories([], [{ id: "m", characterId: "a", content: "x", timestamp: 1 }]).length, 1)],
  ["L unrelated source selection does not alter other systems", () => assert.equal(getOfflineMemorySourceMessages(story([message("new", "x")])).length, 1)],
  ["M duplicate candidate is not extracted again", async () => {
    const result = await MemoryService.extractMemories({ character, characterId: "a", recentMessages: [message("new", "x")], existingMemories: [{ id: "m", characterId: "a", content: "x", timestamp: 1 }], scenario: "offline", apiKey: "", model: "", createId: () => "m2", currentTime: () => 2, formatContent: (items) => items.join(";") }, async () => ({ items: ["x"] }));
    assert.equal(result.extractedMemories.length, 0);
  }],
  ["N legacy imported id is excluded", () => assert.equal(getOfflineMemorySourceMessages(story([message("offline-import-x", "old")])).length, 0)],
  ["O synchronization metadata does not change story messages", () => assert.equal(story([message("new", "x")], { syncedSourceMessageIds: ["new"] }).messages.length, 1)],
  ["P no progress means no automatic sync candidate", () => assert.equal(hasUnsyncedOfflineMemoryProgress(story([], { lastSyncedMessageCount: 0 })), false)],
  ["Q fallback handoff keeps the online marker, current character, and a factual event summary", () => {
    const handoff = createOfflineStoryHandoffMemory({ story: story([message("new", "明天一起去看电影")]), sourceMessages: [message("new", "明天一起去看电影")], characterId: "a", id: "handoff", timestamp: 2 });
    assert.equal(handoff.characterId, "a");
    assert.ok(handoff.content.includes("offline-story:story-a:0-1"));
    assert.ok(handoff.content.includes("双方曾讨论或约定一起看电影。"));
  }],
  ["R fallback handoff is retrievable for the next online prompt", () => {
    const handoff = createOfflineStoryHandoffMemory({ story: story([message("new", "明天一起去看电影")]), sourceMessages: [message("new", "明天一起去看电影")], characterId: "a", id: "handoff", timestamp: 2 });
    const recalled = MemoryService.retrieveRelevantMemories({ characterId: "a", queryText: "刚才我们约好了什么", existingMemories: [handoff], limit: 5, scenario: "chat" });
    assert.equal(recalled[0]?.id, "handoff");
  }],
];

for (const [name, run] of tests) {
  await run();
  console.log(`PASS ${name}`);
}
console.log(`${tests.length} offline memory sync checks passed`);
