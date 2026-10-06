import assert from "node:assert/strict";
import { useOfflineStoryExitFinalization } from "../src/features/offline/hooks/useOfflineStoryExitFinalization";
import { shouldAutoSyncOnlineContinuation } from "../src/domain/memory/offlineMemorySync";
import type { OfflineStory } from "../src/types";

const story: OfflineStory = {
  id: "view-only-story",
  characterId: "view-only-character",
  relationId: "view-only-relation",
  conversationId: "view-only-conversation",
  title: "legacy synced story",
  mode: "continue",
  createdAt: 1,
  updatedAt: 2,
  memorySyncStatus: "synced",
  messages: [{
    id: "view-only-message",
    characterId: "view-only-character",
    relationId: "view-only-relation",
    conversationId: "view-only-conversation",
    sender: "user",
    content: "already consolidated content",
    timestamp: 2,
    isOffline: true,
  }],
};

const activeStoryRef = { current: story as OfflineStory | null };
const saved: OfflineStory[] = [];
let consolidationStarted = false;

const { finalizeStoryBeforeLeaving } = useOfflineStoryExitFinalization({
  activeStoryRef,
  appointments: [],
  shouldSyncStoryMemory: shouldAutoSyncOnlineContinuation,
  handleSyncMemoryToBrain: async () => {
    consolidationStarted = true;
    return story;
  },
  onSaveOfflineStory: (next) => { saved.push(next); return true; },
  saveActiveStorySnapshot: (next) => { saved.push(next); },
  showToast: () => undefined,
});

const finalized = await finalizeStoryBeforeLeaving(story);
assert.equal(finalized.onlineHandoff, undefined, "view-only exit does not create a new handoff");
assert.equal(consolidationStarted, false, "view-only exit does not schedule memory consolidation");
assert.equal(saved.length, 1, "view-only exit persists one archive snapshot");
console.log("PASS view-only offline exit archives without a duplicate handoff or memory summary");

const legacyStory: OfflineStory = {
  ...story,
  id: "legacy-view-only-story",
  memorySyncStatus: undefined,
  archivedAt: 3,
  onlineHandoff: undefined,
};
const legacyActiveStoryRef = { current: legacyStory as OfflineStory | null };
let legacyConsolidationStarted = false;
const { finalizeStoryBeforeLeaving: finalizeLegacyStory } = useOfflineStoryExitFinalization({
  activeStoryRef: legacyActiveStoryRef,
  appointments: [],
  shouldSyncStoryMemory: shouldAutoSyncOnlineContinuation,
  handleSyncMemoryToBrain: async () => {
    legacyConsolidationStarted = true;
    return legacyStory;
  },
  onSaveOfflineStory: () => true,
  saveActiveStorySnapshot: () => undefined,
  showToast: () => undefined,
});

await finalizeLegacyStory(legacyStory);
assert.equal(legacyConsolidationStarted, false, "legacy archived view-only exit does not replay memory consolidation");
console.log("PASS legacy archived offline exit stays quiet without sync metadata");
