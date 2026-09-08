import type { CharacterPromptProjection } from "../../../domain/prompt/characterPromptProjector";
import { LIVING_HUMAN_PROMPT } from "../../../utils/livingPrompt";
import { CHARACTER_MEDIA_USAGE_RULES, DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES, DIRECT_CHAT_SINGLE_SPEAKER_RULE, WORLD_BOOK_CONTEXT_PRIORITY } from "./chatPromptPolicy";
import { CHINESE_SEMANTIC_CONTINUITY_PROMPT, CURRENT_SCENE_CONTINUITY_PROMPT } from "./directChatTurnPrompt";
import { finalizeCharacterChatSystemInstruction } from "./chatPromptBuilders";

export type DirectChatPromptBuilderInput = {
  mainPromptText: string;
  musicContext?: string;
  forumContext?: string;
  diaryContext?: string;
  userMemoContext?: string;
  redPacketReactionPrompt?: string;
  newDayBoundaryPrompt?: string;
  timeAwarenessPrompt?: string;
  voiceIntervalPrompt?: string;
  afterMainWorldBook?: string;
  beforeCharacterWorldBook?: string;
  characterDescriptionText: string;
  personalityText: string;
  relationshipContext?: string;
  characterBehaviorPrompt?: string;
  characterContextText?: string;
  cognitivePrompt?: string;
  afterCharacterWorldBook?: string;
  userProfileText: string;
  aliasIdentityBoundaryPrompt?: string;
  userKnowledgeBoundary: string;
  innerVoiceInstruction?: string;
  beforeHistoryWorldBook?: string;
  momentsContext?: string;
  offlineStoriesContext?: string;
  includeLongTermMemory: boolean;
  characterKnowledgeBoundary: string;
  onlineChatSpatialBoundary: string;
  voiceCallPrompts?: readonly string[];
  stickerPrompt?: string;
  extraInstructions?: readonly string[];
  worldBookContextPriority?: boolean;
  characterProjection: CharacterPromptProjection;
  diagnosticLabel: "direct chat prompt" | "regenerate prompt";
  finalPersonaRules?: readonly string[];
  finalPriorityInstructions?: readonly string[];
  finalLanguageInstruction: string;
  finalSystemInstructionSuffix?: string;
};

/**
 * Shared ordering boundary for ordinary direct replies and regeneration.
 * Callers still build feature-specific context; this function owns only the
 * established block sequence and final character-instruction assembly.
 */
export function buildDirectChatSystemInstruction(input: DirectChatPromptBuilderInput): string {
  const instructions: string[] = [LIVING_HUMAN_PROMPT, input.mainPromptText];
  for (const block of [
    input.musicContext,
    input.forumContext,
    input.diaryContext,
    input.userMemoContext,
    input.redPacketReactionPrompt,
    input.newDayBoundaryPrompt,
    input.timeAwarenessPrompt,
    input.voiceIntervalPrompt,
    input.afterMainWorldBook,
    input.beforeCharacterWorldBook,
  ]) {
    if (block) instructions.push(block);
  }

  instructions.push(input.characterDescriptionText, input.personalityText);
  for (const block of [
    input.relationshipContext,
    input.characterBehaviorPrompt,
  ]) {
    if (block) instructions.push(block);
  }
  if (input.characterContextText?.trim()) instructions.push(input.characterContextText);
  if (input.cognitivePrompt) instructions.push(input.cognitivePrompt);
  if (input.afterCharacterWorldBook) instructions.push(input.afterCharacterWorldBook);

  instructions.push(input.userProfileText);
  for (const block of [
    input.aliasIdentityBoundaryPrompt,
    input.userKnowledgeBoundary,
    DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES,
    DIRECT_CHAT_SINGLE_SPEAKER_RULE,
    input.innerVoiceInstruction,
    CURRENT_SCENE_CONTINUITY_PROMPT,
    CHINESE_SEMANTIC_CONTINUITY_PROMPT,
    input.beforeHistoryWorldBook,
  ]) {
    if (block) instructions.push(block);
  }

  if (input.includeLongTermMemory) {
    for (const block of [input.momentsContext, input.offlineStoriesContext]) {
      if (block) instructions.push(block);
    }
  }

  instructions.push(
    input.characterKnowledgeBoundary,
    input.onlineChatSpatialBoundary,
    CHARACTER_MEDIA_USAGE_RULES,
  );
  if (input.voiceCallPrompts?.length) instructions.push(...input.voiceCallPrompts);
  if (input.stickerPrompt) instructions.push(input.stickerPrompt);
  if (input.extraInstructions?.length) instructions.push(...input.extraInstructions.filter(Boolean));
  if (input.worldBookContextPriority) instructions.push(WORLD_BOOK_CONTEXT_PRIORITY);

  const finalized = finalizeCharacterChatSystemInstruction({
    instructions,
    characterProjection: input.characterProjection,
    characterDescriptionText: input.characterDescriptionText,
    diagnosticLabel: input.diagnosticLabel,
    finalPersonaRules: input.finalPersonaRules,
    finalPriorityInstructions: input.finalPriorityInstructions,
    finalLanguageInstruction: input.finalLanguageInstruction,
  });
  return input.finalSystemInstructionSuffix
    ? `${finalized}\n\n${input.finalSystemInstructionSuffix}`
    : finalized;
}
