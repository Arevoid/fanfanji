import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acknowledgeOfflineHandoff, buildOfflineHandoffTimelinePromptBlock, buildPendingOfflineHandoffPromptBlock, createPendingOfflineHandoff, getOfflineHandoffSourceMessagesForReturn, getOfflineStorySummaryId, hasOfflineStoryCanonicalSummary, recordOfflineHandoffDelivery, selectFreshOfflineHandoffMemory, selectInterveningOfflineHandoff, selectPendingOfflineHandoffStory } from "../src/domain/memory/offlineMemorySync";
import type { MemoryItem, OfflineStory } from "../src/types";

const handoff: MemoryItem = {
  id: "offline-summary",
  characterId: "character-a",
  relationId: "relation-a",
  content: "【线下关键剧情归档】\n- 用户与角色确认恋爱关系。\n[offline-story:story-a:summary]",
  timestamp: 100,
};

assert.equal(selectFreshOfflineHandoffMemory({
  memories: [handoff],
  relationId: "relation-a",
  queryText: "几点我带点炸鸡过去",
  now: 110,
}), handoff, "a recent handoff remains available across the immediate online return window");
assert.equal(selectFreshOfflineHandoffMemory({
  memories: [handoff],
  relationId: "relation-a",
  queryText: "我们之前确认恋爱关系了吗",
  now: 100 + 3 * 60 * 60 * 1000,
}), handoff, "an older handoff remains retrievable when the query overlaps its facts");
assert.equal(selectFreshOfflineHandoffMemory({
  memories: [handoff],
  relationId: "relation-a",
  queryText: "今天天气怎么样",
  now: 100 + 3 * 60 * 60 * 1000,
}), undefined, "an old unrelated handoff does not pollute ordinary chat");
assert.equal(selectFreshOfflineHandoffMemory({
  memories: [handoff],
  relationId: "relation-b",
  queryText: "确认恋爱关系",
  now: 110,
}), undefined, "another relationship cannot receive this offline memory");

const story: OfflineStory = {
  id: "story-a",
  characterId: "character-a",
  relationId: "relation-a",
  conversationId: "conversation-a",
  title: "刚结束的剧情",
  createdAt: 200,
  updatedAt: 400,
  archivedAt: 400,
  mode: "continue",
  messages: [
    { id: "offline-user", characterId: "character-a", relationId: "relation-a", conversationId: "conversation-a", sender: "user", content: "开门", timestamp: 220, isOffline: true },
    { id: "offline-character", characterId: "character-a", relationId: "relation-a", conversationId: "conversation-a", sender: "character", content: "我来了", timestamp: 300, isOffline: true },
  ],
};
const intervening = selectInterveningOfflineHandoff({
  stories: [story],
  memories: [{ ...handoff, content: `【线下关键剧情归档】\n- 用户与角色确认恋爱关系。\n[offline-story:${story.id}:summary]` }],
  relationId: "relation-a",
  after: 100,
  before: 450,
});
assert.equal(intervening?.story.id, story.id, "a synced offline event between two online sessions is selected without keyword overlap");
const canonicalSummary = {
  id: getOfflineStorySummaryId(story),
  relationId: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  conversationId: "conversation-a",
  summary: "- [已确认事实] 用户与角色确认恋爱关系。",
  sourceMessageIds: ["offline-user", "offline-character"],
  sourceClaimIds: [],
  generatedAt: 400,
  generator: "offline-story.v2",
  projectionVersion: 2,
  status: "active" as const,
  schemaVersion: 1,
};
assert.equal(hasOfflineStoryCanonicalSummary(story, [canonicalSummary]), true, "canonical story summary is discoverable without a MemoryItem");
const canonicalIntervening = selectInterveningOfflineHandoff({
  stories: [story],
  memories: [],
  summaries: [canonicalSummary],
  relationId: "relation-a",
  after: 100,
  before: 450,
});
assert.equal(canonicalIntervening?.story.id, story.id, "canonical summary reaches the timeline handoff without legacy storage");
assert.equal(selectInterveningOfflineHandoff({
  stories: [story],
  memories: [{ ...handoff, content: `【线下关键剧情归档】\n[offline-story:${story.id}:summary]` }],
  relationId: "relation-b",
  after: 100,
  before: 450,
}), undefined, "intervening timelines stay relationship-scoped");
const timeline = buildOfflineHandoffTimelinePromptBlock({
  memory: { ...handoff, timestamp: 400 },
  story,
  previousOnlineAt: 100,
  currentOnlineAt: 450,
});
assert.match(timeline, /上一段线上聊天/);
assert.match(timeline, /已确认的线下互动/);
assert.match(timeline, /当前新线上聊天/);
assert.match(timeline, /刚结束后的衔接/);
assert.match(timeline, /禁止.*发送成聊天气泡/);

const pendingStory = createPendingOfflineHandoff({ story, sourceMessages: story.messages, now: 400 });
assert.equal(pendingStory.onlineHandoff?.status, "pending", "returning online creates a durable handoff without an AI summary");
assert.deepEqual(pendingStory.onlineHandoff?.sourceMessageIds, ["offline-user", "offline-character"]);
assert.deepEqual(getOfflineHandoffSourceMessagesForReturn(story).map((message) => message.id), ["offline-user", "offline-character"], "continue mode always bridges its confirmed transcript");
assert.deepEqual(getOfflineHandoffSourceMessagesForReturn({ ...story, characterIds: ["character-a", "character-b"] }), [], "multi-character stories cannot enter one direct relationship handoff");
const directorStory: OfflineStory = { ...story, mode: "director" };
assert.deepEqual(getOfflineHandoffSourceMessagesForReturn(directorStory), [], "unsynced Director mode stays isolated");
assert.deepEqual(getOfflineHandoffSourceMessagesForReturn({
  ...directorStory,
  memorySyncStatus: "synced",
  syncedSourceMessageIds: ["offline-user"],
}).map((message) => message.id), ["offline-user"], "Director mode bridges only explicitly synced messages");
assert.equal(selectPendingOfflineHandoffStory({
  stories: [pendingStory],
  relationId: "relation-a",
  characterId: "character-a",
  conversationId: "conversation-a",
  now: 450,
}), pendingStory, "the exact relationship can read its pending handoff");
assert.equal(selectPendingOfflineHandoffStory({
  stories: [pendingStory],
  relationId: "relation-b",
  characterId: "character-a",
  conversationId: "conversation-a",
  now: 450,
}), undefined, "another relationship cannot read the pending transcript");
const pendingPrompt = buildPendingOfflineHandoffPromptBlock({
  story: pendingStory,
  characterName: "范千",
  userName: "饭饭",
  previousOnlineAt: 100,
  currentOnlineAt: 450,
});
assert.match(pendingPrompt, /饭饭：开门/);
assert.match(pendingPrompt, /范千：我来了/);
assert.match(pendingPrompt, /刚才\/刚刚\/方才/);
assert.match(pendingPrompt, /不得把用户做的事记成角色做的事/);
assert.match(pendingPrompt, /不得用“谁是你的……”.*否认该关系/);
const firstDelivery = recordOfflineHandoffDelivery(pendingStory, 450);
assert.equal(firstDelivery.onlineHandoff?.status, "pending", "one ignored reply cannot consume the handoff");
assert.equal(firstDelivery.onlineHandoff?.deliveredReplyCount, 1);
const secondDelivery = recordOfflineHandoffDelivery(firstDelivery, 460);
assert.equal(secondDelivery.onlineHandoff?.status, "pending", "the bridge remains available for another online turn");
const thirdDelivery = recordOfflineHandoffDelivery(secondDelivery, 470);
assert.equal(thirdDelivery.onlineHandoff?.status, "pending", "a failed or missing durable summary cannot consume the only handoff copy");
const thirdDurableDelivery = recordOfflineHandoffDelivery(secondDelivery, 470, 3, true);
assert.equal(thirdDurableDelivery.onlineHandoff?.status, "acknowledged", "the bridge retires after three replies only when durable facts exist");
const acknowledgedStory = acknowledgeOfflineHandoff(pendingStory, 500);
assert.equal(acknowledgedStory.onlineHandoff?.status, "acknowledged");
assert.equal(selectPendingOfflineHandoffStory({
  stories: [acknowledgedStory], relationId: "relation-a", characterId: "character-a", conversationId: "conversation-a", now: 500,
}), undefined, "an acknowledged handoff is not injected again");
const olderPendingStory = createPendingOfflineHandoff({
  story: { ...story, id: "story-older" },
  sourceMessages: story.messages,
  now: 300,
});
assert.equal(selectPendingOfflineHandoffStory({
  stories: [olderPendingStory, acknowledgedStory], relationId: "relation-a", characterId: "character-a", conversationId: "conversation-a", now: 500,
}), undefined, "an older pending story cannot resurface after the newest handoff was acknowledged");
assert.equal(selectPendingOfflineHandoffStory({
  stories: [pendingStory], relationId: "relation-a", characterId: "character-a", conversationId: "conversation-a", now: 400 + 3 * 60 * 60 * 1000,
}), undefined, "a failed-summary raw transcript stops pretending to be an immediate return after the continuity window");

const chatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const handoffRecoveryServiceSource = readFileSync(new URL("../src/features/chat/services/offlineHandoffRecoveryService.ts", import.meta.url), "utf8");
const regenerationSource = readFileSync(new URL("../src/features/chat/hooks/useChatRegenerationAction.ts", import.meta.url), "utf8");
const chatRuntimeSource = `${chatSource}\n${regenerationSource}`;
const innerVoiceHookSource = readFileSync(new URL("../src/features/chat/hooks/useInnerVoice.ts", import.meta.url), "utf8");
const bridgeUses = chatRuntimeSource.match(/selectFreshOfflineHandoffMemory\(\{/g) || [];
assert.ok(bridgeUses.length >= 3, "normal replies and regenerated replies retain their offline handoff selection");
assert.match(chatRuntimeSource, /getOfflineContinuityContext/);
assert.match(innerVoiceHookSource, /getOfflineContinuityContext/);
assert.doesNotMatch(chatRuntimeSource, /!relevantMemories\.some\(\(memory\) => memory\.id === latestOfflineContinuationMemory\.id\)/, "structured memory selection cannot suppress the dedicated handoff block");
assert.match(chatRuntimeSource, /history\.push\(\{ role: "user", text: pendingOfflineHistoryAnchor \}\)/, "the offline segment is inserted next to the current online message as hidden history");
assert.match(innerVoiceHookSource, /generateInnerVoice/, "opening a bubble can generate a missing inner voice on demand");
assert.match(chatSource, /createInlineInnerVoiceRecord/, "the reply pipeline persists inline inner voice records");
assert.match(chatRuntimeSource, /createdMessages\.length > 0[\s\S]*recordPendingOfflineHandoffDelivery/, "normal chat records delivery only after creating a reply");
assert.match(handoffRecoveryServiceSource, /recentUntrackedStory[\s\S]*createPendingOfflineHandoff/, "recent pre-schema stories can repair a missed first online handoff");
assert.match(chatSource, /chat-offline-timeline-event__label/, "the visible chat timeline marks a synced offline meeting between online messages");

const offlineSource = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const offlineExitFinalization = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryExitFinalization.ts", import.meta.url), "utf8");
assert.match(offlineExitFinalization, /createPendingOfflineHandoff\(\{[\s\S]*story: completedStory/, "offline exit persists a handoff independently of extraction success");

console.log("PASS saved offline memory reaches the first online character reply without cross-relation leakage");
