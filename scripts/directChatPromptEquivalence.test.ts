import assert from "node:assert/strict";
import { buildComposedAiChatRequest } from "../src/features/chat/controllers/chatGenerationController";
import { buildDirectChatContextSnapshot } from "../src/features/chat/services/directChatContextSnapshotBuilder";
import { PromptComposer } from "../src/domain/prompt/PromptComposer";
import type { Message, UserSettings } from "../src/types";

const settings = {
  apiKey: "test-key",
  selectedModel: "test-model",
  apiTemperature: 0.4,
  streamCompatible: false,
} as UserSettings;

const oldMessageAt = new Date("2026-08-01T22:30:00+08:00").getTime();
const currentMessageAt = new Date("2026-08-12T14:19:00+08:00").getTime();
const messages = [
  { id: "old", characterId: "character-1", sender: "character", content: "旧的现场", timestamp: oldMessageAt },
  { id: "recent-user", characterId: "character-1", sender: "user", content: "最近的问题", timestamp: currentMessageAt - 90_000 },
  { id: "current", characterId: "character-1", sender: "user", content: "当前输入", timestamp: currentMessageAt },
] as Message[];

const historySnapshot = buildDirectChatContextSnapshot({
  messages,
  userMessageId: "current",
  userMessageAt: currentMessageAt,
  enableTimeAwareness: true,
  contextLimit: 150,
  historyCharacterLimit: 16_000,
  historicalReferenceCharacterLimit: 6_000,
  characterName: "角色",
  userName: "用户",
  requestTime: new Date("2026-08-12T14:20:00+08:00"),
});

assert.deepEqual(historySnapshot.finalMessages.map((message) => message.id), ["old", "recent-user", "current"]);
assert.deepEqual(historySnapshot.messagesForHistory.map((message) => message.id), ["old", "recent-user"]);
assert.deepEqual(historySnapshot.recentMessages.map((message) => message.id), ["recent-user"]);
assert.equal(historySnapshot.history.length, 1);
assert.equal(historySnapshot.history[0].role, "user");
assert.match(historySnapshot.history[0].text, /最近的问题/);
assert.match(historySnapshot.crossDayHistoricalReference, /旧的现场/);
assert.match(historySnapshot.timeLogString, /最近的问题/);
assert.equal(historySnapshot.hasCrossDayHistory, true);

const commonBlocks = [
  "character definition",
  "personality",
  "relationship",
  "scene / co-location",
  "time context",
  "identity boundary",
  "WorldBook",
  "Truth / Memory",
  "conversation summary",
  "Moments",
  "Offline",
  "Music",
  "Forum",
  "Diary",
  "Memo",
  "language/style constraints",
].map((block) => `[${block}]`).join("\n\n---\n\n");
const promptInput = {
  message: "当前输入",
  history: historySnapshot.history,
  systemInstruction: commonBlocks,
  historyInjections: [{ id: "world-book-1", depth: 1, content: "WorldBook" }],
};

const sendRequest = buildComposedAiChatRequest({ scenario: "direct-chat", ...promptInput }, settings);
const regenerateRequest = buildComposedAiChatRequest({ scenario: "regenerate", ...promptInput }, settings);
const normalizeProviderPrompt = (request: typeof sendRequest) => ({
  message: request.message,
  history: request.history,
  systemInstruction: request.systemInstruction,
  imageDataUrl: request.imageDataUrl,
});
assert.deepEqual(normalizeProviderPrompt(sendRequest), normalizeProviderPrompt(regenerateRequest));

const composed = PromptComposer.compose({
  scenario: "direct-chat",
  message: promptInput.message,
  history: promptInput.history,
  systemInstruction: commonBlocks,
  historyInjections: promptInput.historyInjections,
});
assert.deepEqual(composed.history[0], { role: "system", text: "[World Book at history depth 1 / 世界书指定深度]\nWorldBook" });
assert.deepEqual(composed.history.slice(1), promptInput.history);
assert.equal(composed.systemInstruction, commonBlocks);

const regenerateSnapshot = buildDirectChatContextSnapshot({
  messages,
  userMessageId: "current",
  historyExcludedMessageIds: ["current"],
  userMessageAt: currentMessageAt,
  enableTimeAwareness: true,
  contextLimit: 10,
  historyCharacterLimit: Number.MAX_SAFE_INTEGER,
  historicalReferenceCharacterLimit: Number.MAX_SAFE_INTEGER,
  characterName: "角色",
  userName: "用户",
  requestTime: new Date("2026-08-12T14:20:00+08:00"),
  timeLogStyle: "compact",
});
assert.deepEqual(regenerateSnapshot.messagesForHistory.map((message) => message.id), ["old", "recent-user"]);
assert.deepEqual(regenerateSnapshot.recentMessages.map((message) => message.id), ["recent-user"]);
assert.doesNotMatch(regenerateSnapshot.timeLogString, /居中分割时间标签/);

console.log("Direct chat prompt/context equivalence guards: history, cross-day, time, WorldBook insertion, shared PromptComposer boundary passed");
