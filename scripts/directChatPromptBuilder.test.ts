import assert from "node:assert/strict";
import { projectCharacterPrompt } from "../src/domain/prompt/characterPromptProjector";
import { buildDirectChatSystemInstruction } from "../src/features/chat/prompts/directChatPromptBuilder";

const projection = projectCharacterPrompt({
  id: "builder-character",
  name: "角色",
  personality: "PERSONALITY",
  backstory: "BACKSTORY",
});
const prompt = buildDirectChatSystemInstruction({
  mainPromptText: "MAIN",
  musicContext: "MUSIC",
  forumContext: "FORUM",
  diaryContext: "DIARY",
  userMemoContext: "MEMO",
  redPacketReactionPrompt: "RED_PACKET",
  newDayBoundaryPrompt: "NEW_DAY",
  timeAwarenessPrompt: "TIME",
  voiceIntervalPrompt: "VOICE_INTERVAL",
  afterMainWorldBook: "WB_AFTER_MAIN",
  beforeCharacterWorldBook: "WB_BEFORE_CHARACTER",
  characterDescriptionText: "DESCRIPTION",
  personalityText: "PERSONALITY_BLOCK",
  relationshipContext: "RELATIONSHIP",
  characterBehaviorPrompt: "BEHAVIOR",
  characterContextText: "CONTEXT",
  cognitivePrompt: "COGNITIVE",
  afterCharacterWorldBook: "WB_AFTER_CHARACTER",
  userProfileText: "PROFILE",
  aliasIdentityBoundaryPrompt: "ALIAS",
  userKnowledgeBoundary: "BLOCK_USER_KNOWLEDGE",
  innerVoiceInstruction: "BLOCK_INNER_VOICE",
  beforeHistoryWorldBook: "WB_BEFORE_HISTORY",
  momentsContext: "MOMENTS",
  offlineStoriesContext: "OFFLINE",
  includeLongTermMemory: true,
  characterKnowledgeBoundary: "BLOCK_KNOWLEDGE",
  onlineChatSpatialBoundary: "SPATIAL",
  voiceCallPrompts: ["CALL"],
  stickerPrompt: "STICKER",
  extraInstructions: ["EXTRA"],
  worldBookContextPriority: true,
  characterProjection: projection,
  diagnosticLabel: "direct chat prompt",
  finalLanguageInstruction: "LANGUAGE",
  finalSystemInstructionSuffix: "SUFFIX",
});

const orderedMarkers = [
  "MAIN", "MUSIC", "FORUM", "DIARY", "MEMO", "RED_PACKET", "NEW_DAY", "TIME",
  "VOICE_INTERVAL", "WB_AFTER_MAIN", "WB_BEFORE_CHARACTER", "RELATIONSHIP",
  "BEHAVIOR", "CONTEXT", "COGNITIVE", "WB_AFTER_CHARACTER", "PROFILE", "ALIAS",
  "BLOCK_USER_KNOWLEDGE", "BLOCK_INNER_VOICE", "MOMENTS", "OFFLINE", "BLOCK_KNOWLEDGE", "SPATIAL",
  "CALL", "STICKER", "EXTRA",
];
let previousIndex = -1;
for (const marker of orderedMarkers) {
  const index = prompt.indexOf(marker);
  assert.ok(index > previousIndex, marker + " must retain direct-chat block order");
  previousIndex = index;
}
assert.ok(prompt.endsWith("SUFFIX"));
assert.ok(prompt.indexOf("LANGUAGE") < prompt.indexOf("SUFFIX"));

console.log("Direct chat prompt builder preserves shared block order and finalization");
