import assert from "node:assert/strict";
import {
  filterOfflineExtractedFacts,
  getOfflineStorySummaryMarker,
  isOfflineStoryHandoffMemory,
} from "../src/domain/memory/offlineMemorySync";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character, MemoryItem, Message, OfflineStory } from "../src/types";

const character: Character = { id: "character-a", name: "角色A", avatar: "", personality: "", backstory: "" };
const story: OfflineStory = {
  id: "story-summary-a",
  characterId: character.id,
  relationId: "relation-a",
  title: "线下续写",
  createdAt: 1,
  updatedAt: 2,
  mode: "continue",
  sourceChatId: character.id,
  messages: [{
    id: "message-a",
    characterId: character.id,
    relationId: "relation-a",
    sender: "user",
    content: "明天一起通话。",
    timestamp: 2,
  } satisfies Message],
};

const legacy: MemoryItem = {
  id: "legacy-handoff",
  characterId: character.id,
  relationId: "relation-a",
  content: "【线下剧本《线下续写》线上交接】\n[offline-story:story-summary-a:0-1]\n- 线下剧本《线下续写》已结束，双方有过线下互动；具体动作、场景和演出对白不作为线上记忆。",
  timestamp: 3,
};

const canonicalMarker = getOfflineStorySummaryMarker(story);
const tests: Array<[string, () => void | Promise<void>]> = [
  ["A canonical marker remains stable across incremental message counts", () => {
    assert.equal(canonicalMarker, getOfflineStorySummaryMarker({ ...story, messages: [...story.messages, { ...story.messages[0], id: "message-b" }] }));
  }],
  ["B legacy range marker is recognized as this story's replaceable handoff", () => {
    assert.equal(isOfflineStoryHandoffMemory(legacy, story), true);
  }],
  ["C ambiguous pronoun-only extraction cannot create a memory", async () => {
    const result = await MemoryService.extractMemories({
      character,
      characterId: character.id,
      relationId: story.relationId,
      recentMessages: story.messages,
      existingMemories: [],
      scenario: "offline",
      apiKey: "",
      model: "",
      filterItems: filterOfflineExtractedFacts,
      createId: () => "ambiguous",
      currentTime: () => 4,
      formatContent: (items) => items.join("\n"),
    }, async () => ({ items: ["我答应明天陪你。"] }));
    assert.equal(result.extractedMemories.length, 0);
  }],
  ["D confirmed third-person facts produce a canonical summary", async () => {
    const result = await MemoryService.extractMemories({
      character,
      characterId: character.id,
      relationId: story.relationId,
      recentMessages: story.messages,
      existingMemories: [],
      scenario: "offline",
      apiKey: "",
      model: "",
      filterItems: filterOfflineExtractedFacts,
      createId: () => "summary",
      currentTime: () => 4,
      formatContent: (items) => `【线下剧情摘要】\n${items.map((item) => `- ${item}`).join("\n")}\n[${canonicalMarker}]`,
    }, async () => ({ items: ["用户与角色A约定明天通话。"] }));
    assert.equal(result.extractedMemories.length, 1);
    assert.ok(result.extractedMemories[0]?.content.includes(canonicalMarker));
  }],
  ["E replacing handoffs removes all legacy batches for the same story", () => {
    const replacement: MemoryItem = {
      id: "summary",
      characterId: character.id,
      relationId: story.relationId,
      content: `【线下剧情摘要】\n[${canonicalMarker}]\n- 用户与角色A约定明天通话。`,
      timestamp: 4,
    };
    const retained = [legacy, { ...legacy, id: "other-story", content: "[offline-story:other:summary]" }]
      .filter((memory) => !isOfflineStoryHandoffMemory(memory, story));
    const next = MemoryService.mergeMemories(retained, [replacement]);
    assert.deepEqual(next.map((memory) => memory.id), ["summary", "other-story"]);
  }],
];

for (const [name, run] of tests) {
  await run();
  console.log(`PASS ${name}`);
}
console.log(`${tests.length} offline story summary checks passed`);
