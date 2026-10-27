import assert from "node:assert/strict";
import { createOfflineTimelineLookup } from "../src/features/chat/services/offlineTimelineLookup";
import { getOfflineTimelineStoriesBetween } from "../src/features/chat/services/offlineHandoffPromptContext";
import { getOfflineStorySummaryId } from "../src/domain/memory/offlineMemorySync";
import { deferForegroundTask } from "../src/core/runtime/deferredForegroundTask";
import type { OfflineStory } from "../src/types";
import type { ConversationSummaryRecord } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { Message } from "../src/types";
import { indexChatTurnEnds } from "../src/domain/chat/chatTimelineIndex";

const stories = [70, 10, 40, 40, 90].map((at, i) => ({ id: `s${i}`, characterId: "c", relationId: i === 4 ? "secret" : "r", title: "合成线下", messages: [], updatedAt: at, createdAt: 1 } as OfflineStory));
const summaries = stories.slice(0, 3).map(story => ({ id: getOfflineStorySummaryId(story), status: "active" } as ConversationSummaryRecord));
const messages = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), characterId: "c", sender: i % 9 ? "character" : "user", isNarration: i % 13 === 0, content: "合成", timestamp: i } as Message));
const tails = indexChatTurnEnds(messages);
messages.forEach((message, index) => {
  let expected = message;
  for (let i = index + 1; i < messages.length; i++) { if (messages[i].isNarration || messages[i].sender !== message.sender) break; expected = messages[i]; }
  assert.equal(tails.get(message.id), expected);
});
for (const relationId of ["r", "secret", undefined]) for (const isGroup of [false, true]) {
  const input = { relationId, isGroup, offlineStories: stories, summaries, memories: [] };
  const prepared = createOfflineTimelineLookup(input);
  for (const previousAt of [undefined, 0, 1, 10, 39, 40, 70]) for (const currentAt of [10, 40, 70, 100]) {
    assert.deepEqual(prepared(previousAt, currentAt), getOfflineTimelineStoriesBetween({ ...input, previousAt, currentAt }));
  }
}
const timers = new Map<number, () => void>(), idle = new Map<number, () => void>(); let id = 0, runs = 0;
Object.assign(globalThis, { window: { setTimeout: (callback: () => void) => { timers.set(++id, callback); return id; }, clearTimeout: (key: number) => timers.delete(key), requestIdleCallback: (callback: () => void) => { idle.set(++id, callback); return id; }, cancelIdleCallback: (key: number) => idle.delete(key) } });
const cancelBefore = deferForegroundTask(() => runs++); assert.equal(runs, 0); cancelBefore(); assert.equal(timers.size, 0);
const cancelIdle = deferForegroundTask(() => runs++); [...timers.values()].forEach(run => run()); timers.clear(); assert.equal(runs, 0); cancelIdle(); assert.equal(idle.size, 0);
deferForegroundTask(() => runs++); [...timers.values()].forEach(run => run()); [...idle.values()].forEach(run => run()); assert.equal(runs, 1);
console.log("PASS prepared offline timeline equals canonical relation/time/summary policy; foreground jobs defer and cancel before idle execution");
