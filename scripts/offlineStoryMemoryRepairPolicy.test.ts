import { strict as assert } from "node:assert";
import { getOfflineStoryMemoryRepairNeeds } from "../src/features/offline/services/offlineStoryMemoryRepairPolicy";
import type { MemoryItem, OfflineStory } from "../src/types";

const story = { id: "story-1", title: "雨夜", mode: "continue", messages: [], characterId: "char-1", characterIds: ["char-1"], memorySyncStatus: "synced", archivedAt: Date.now() } as unknown as OfflineStory;
const baseMemory = { id: "memory-1", characterId: "char-1", content: "【线下剧本《雨夜》线上交接】\noffline-story:story-1:summary", source: "offline_story" } as unknown as MemoryItem;

assert.deepEqual(getOfflineStoryMemoryRepairNeeds(story, []), { legacyHandoff: false, missingSummary: true, uninformativeSummary: false });
assert.equal(getOfflineStoryMemoryRepairNeeds(story, [baseMemory]).missingSummary, false);
assert.equal(getOfflineStoryMemoryRepairNeeds(story, [{ ...baseMemory, content: "旧版线下交接 offline-story:story-1:old" }]).legacyHandoff, true);
assert.equal(getOfflineStoryMemoryRepairNeeds(story, [{ ...baseMemory, content: `${baseMemory.content}\n双方有过线下互动；具体动作、场景和演出对白不作为线上记忆` }]).uninformativeSummary, true);

console.log("PASS offline story memory repair policy preserves legacy, missing-summary, and uninformative-summary detection");
