import assert from "node:assert/strict";
import { formatOnlineChatSpatialBoundary } from "../src/domain/prompt/characterKnowledgeBoundary";
import { isOnlineContinuationStory, shouldAutoSyncOnlineContinuation } from "../src/domain/memory/offlineMemorySync";
import { sanitizeMomentPublishText } from "../src/features/moments/services/momentContent";
import type { OfflineStory } from "../src/types";

const baseStory: OfflineStory = {
  id: "story-1",
  characterId: "character-a",
  title: "Story",
  createdAt: 1,
  updatedAt: 2,
  mode: "director",
  messages: [{ id: "plot-1", characterId: "character-a", sender: "user", content: "new plot", timestamp: 2, isOffline: true }],
};

const continuation: OfflineStory = {
  ...baseStory,
  id: "continue-story",
  mode: "continue",
  sourceChatId: "character-a",
  sourceChatMsgCount: 2,
};

assert.equal(isOnlineContinuationStory(baseStory), false, "director stories stay isolated");
assert.equal(shouldAutoSyncOnlineContinuation(baseStory), false);
assert.equal(isOnlineContinuationStory({ ...continuation, mode: "if" }), false, "IF branches stay isolated");
assert.equal(isOnlineContinuationStory(continuation), true, "linked continuation is eligible");
assert.equal(shouldAutoSyncOnlineContinuation(continuation), true, "new continuation content syncs");
assert.equal(
  shouldAutoSyncOnlineContinuation({ ...continuation, sourceChatId: undefined, sourceChatMsgCount: undefined }),
  true,
  "new offline continuation also syncs when it ends",
);
assert.equal(
  shouldAutoSyncOnlineContinuation({ ...continuation, lastSyncedMessageCount: continuation.messages.length }),
  false,
  "already-synced continuation does not sync twice",
);

const spatialBoundary = formatOnlineChatSpatialBoundary();
assert.match(spatialBoundary, /\u8fdc\u7a0b\u7ebf\u4e0a\u804a\u5929/);
assert.match(spatialBoundary, /不得描述[^。\n]*把实物递给用户/);
assert.match(spatialBoundary, /\u6211\u53bb\u53a8\u623f\u5012\u676f\u6c34/);
assert.match(spatialBoundary, /\u4e0b\u6b21\u89c1\u9762\u7ed9\u4f60\u5e26/);
assert.match(
  spatialBoundary,
  /\u8fc7\u53bb\u7ebf\u4e0b\u5267\u60c5[^。\n]*\u4e0d\u80fd\u5355\u72ec\u8bc1\u660e\u5f53\u524d\u4ecd\u5728\u540c\u5730/,
);

assert.equal(
  sanitizeMomentPublishText("[sticker|happy|https://example.test/sticker.png] text moment"),
  "text moment",
);

console.log("PASS continuation-only offline sync, moment sticker exclusion, and online spatial boundaries");
