import assert from "node:assert/strict";
import { useOfflineStoryExitFinalization } from "../src/features/offline/hooks/useOfflineStoryExitFinalization";
import type { OfflineStory } from "../src/types";

const story: OfflineStory = {
  id: "rc-offline-story",
  characterId: "rc-character",
  relationId: "rc-relation",
  conversationId: "rc-conversation",
  title: "synthetic RC story",
  mode: "continue",
  createdAt: 1,
  updatedAt: 2,
  messages: [{
    id: "rc-offline-message",
    characterId: "rc-character",
    relationId: "rc-relation",
    conversationId: "rc-conversation",
    sender: "user",
    content: "synthetic offline event",
    timestamp: 2,
    isOffline: true,
  }],
};

const activeStoryRef = { current: story as OfflineStory | null };
const saved: OfflineStory[] = [];
let releaseConsolidation: (() => void) | undefined;
let consolidationStarted = false;
let consolidationFinished = false;
const consolidation = new Promise<void>((resolve) => { releaseConsolidation = resolve; });

const { finalizeStoryBeforeLeaving } = useOfflineStoryExitFinalization({
  activeStoryRef,
  appointments: [],
  shouldSyncStoryMemory: () => true,
  handleSyncMemoryToBrain: async () => {
    consolidationStarted = true;
    await consolidation;
    consolidationFinished = true;
    return story;
  },
  onSaveOfflineStory: (next) => { saved.push(next); return true; },
  saveActiveStorySnapshot: (next) => { saved.push(next); },
  showToast: () => undefined,
});

const finalized = await finalizeStoryBeforeLeaving(story);
assert.equal(finalized.onlineHandoff?.status, "pending", "handoff is durable before consolidation finishes");
assert.equal(saved[0]?.onlineHandoff?.status, "pending", "the first persisted snapshot is the lightweight handoff");

let onlineReturn = false;
const onlineReturnPromise = Promise.resolve().then(() => { onlineReturn = true; });
await onlineReturnPromise;
assert.equal(onlineReturn, true, "Online return can complete without awaiting heavy consolidation");
assert.equal(consolidationStarted, true, "heavy consolidation is scheduled after handoff persistence");
assert.equal(consolidationFinished, false, "heavy consolidation remains pending while Online returns");

releaseConsolidation?.();
await consolidation;
await Promise.resolve();
assert.equal(consolidationFinished, true, "scheduled consolidation can complete after Online returns");
console.log("PASS offline exit persists bounded handoff before asynchronous memory consolidation");
