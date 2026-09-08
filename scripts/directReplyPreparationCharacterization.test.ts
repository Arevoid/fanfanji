import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDirectChatContextSnapshot } from "../src/features/chat/services/directChatContextSnapshotBuilder";
import { buildDirectChatSystemInstruction } from "../src/features/chat/prompts/directChatPromptBuilder";
import { projectCharacterPrompt } from "../src/domain/prompt/characterPromptProjector";
import type { Message } from "../src/types";

const userMessage: Message = {
  id: "preparation-user",
  characterId: "preparation-character",
  sender: "user",
  content: "当前问题",
  timestamp: 1_700_000_000_000,
};
const previousReply: Message = {
  id: "preparation-reply",
  characterId: "preparation-character",
  sender: "character",
  content: "上一条回复",
  timestamp: userMessage.timestamp - 1_000,
};

const snapshot = buildDirectChatContextSnapshot({
  messages: [previousReply, userMessage],
  userMessageId: userMessage.id,
  userMessageAt: userMessage.timestamp,
  enableTimeAwareness: false,
  contextLimit: 20,
  historyCharacterLimit: 16_000,
  historicalReferenceCharacterLimit: 6_000,
  characterName: "角色",
  userName: "用户",
});
const characterProjection = projectCharacterPrompt({
  id: "preparation-character",
  name: "角色",
  personality: "PERSONALITY",
  backstory: "BACKSTORY",
});
const systemInstruction = buildDirectChatSystemInstruction({
  mainPromptText: "MAIN_PROMPT",
  characterDescriptionText: "DESCRIPTION",
  personalityText: "PERSONALITY_BLOCK",
  relationshipContext: "RELATIONSHIP",
  characterContextText: "CONTEXT",
  userProfileText: "PROFILE",
  userKnowledgeBoundary: "KNOWLEDGE",
  includeLongTermMemory: false,
  characterKnowledgeBoundary: "CHARACTER_BOUNDARY",
  onlineChatSpatialBoundary: "ONLINE_BOUNDARY",
  characterProjection,
  diagnosticLabel: "direct chat prompt",
  finalLanguageInstruction: "LANGUAGE",
});

assert.deepEqual(snapshot.history.map((entry) => entry.text), ["上一条回复"]);
assert.equal(snapshot.messagesForHistory.some((message) => message.id === userMessage.id), false);
assert.ok(systemInstruction.indexOf("MAIN_PROMPT") < systemInstruction.indexOf("DESCRIPTION"));
assert.ok(systemInstruction.indexOf("DESCRIPTION") < systemInstruction.indexOf("PROFILE"));

const appChatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const normalPipeline = appChatSource.slice(
  appChatSource.indexOf("const executeDirectReplyPipeline"),
  appChatSource.indexOf("const chatReplyController"),
);
assert.match(normalPipeline, /buildDirectChatContextSnapshot\(\{/);
assert.match(normalPipeline, /buildDirectChatSystemInstruction\(\{/);
assert.match(normalPipeline, /prompt: \{ scenario: "direct-chat"/);
assert.match(normalPipeline, /if \(isOfflineModeActive\)/);
assert.match(normalPipeline, /executeDirectReplyUseCase\(/);
assert.match(normalPipeline, /postReplyCoordinator\.schedule/);

const controllerSource = readFileSync(new URL("../src/features/chat/hooks/useChatController.ts", import.meta.url), "utf8");
const sendOnlyStart = controllerSource.indexOf("const handleSendOnly");
const sendOnlyEnd = controllerSource.indexOf("// Handle Send Message and Trigger AI reply", sendOnlyStart);
assert.ok(sendOnlyStart >= 0 && sendOnlyEnd > sendOnlyStart);
const sendOnlyBody = controllerSource.slice(sendOnlyStart, sendOnlyEnd);
assert.doesNotMatch(sendOnlyBody, /buildDirectChatContextSnapshot|buildDirectChatSystemInstruction|executeDirectReplyUseCase/);

const regenerationSource = readFileSync(new URL("../src/features/chat/hooks/useChatRegenerationAction.ts", import.meta.url), "utf8");
assert.match(regenerationSource, /buildDirectChatContextSnapshot\(\{/);
assert.match(regenerationSource, /buildDirectChatSystemInstruction\(\{/);
assert.doesNotMatch(regenerationSource, /prepareDirectReplyTurn/);

console.log("Direct reply preparation characterization: history boundary, prompt order, normal/send-only/regenerate seams locked");
