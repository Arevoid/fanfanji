import type { apiChat } from "../../../utils/apiHelper";
import type { Message } from "../../../types";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import { buildProactivePromptContext, formatProactivePromptContext } from "../../characterCognitive/promptAdapters/proactivePromptAdapter";
import { requestAiReply } from "./aiReplyService";
import { createCharacterTextMessage } from "./messageFactory";
import { cleanAiReplyText, splitAiReplyBubbles } from "./messageParser";
import { suppressCharacterEmoji } from "./characterEmojiPolicy";
import type { AiChatRequest } from "./chatServiceTypes";

export async function generateProactiveReplyCandidates(input: {
  requestAi: typeof apiChat;
  request: AiChatRequest;
  characterId: string;
  disableBracketActions: boolean;
  keepPeriods: boolean;
  createId: (index: number) => string;
  currentTime: (index: number) => number;
  transformBubble?: (bubbleText: string, index: number) => string;
  /** Relation-scoped snapshot; only its ProactivePromptAdapter projection reaches the request. */
  cognitiveContext?: CharacterCognitiveContext;
}): Promise<{ data: Awaited<ReturnType<typeof import("../../../utils/apiHelper").apiChat>>; messages: Message[] }> {
  const cognitivePromptBlock = input.cognitiveContext
    ? formatProactivePromptContext(buildProactivePromptContext(input.cognitiveContext))
    : "";
  const request = cognitivePromptBlock
    ? {
      ...input.request,
      systemInstruction: [input.request.systemInstruction, cognitivePromptBlock].filter(Boolean).join("\n\n"),
    }
    : input.request;
  const data = await requestAiReply(input.requestAi, request);
  if (!data?.text) return { data, messages: [] };
  const cleanedText = suppressCharacterEmoji(cleanAiReplyText(data.text, input.disableBracketActions));
  // Internal scheduling metadata is model context, never user-visible chat.
  // Do not fall back to the raw response when sanitization removes everything.
  const bubbles = cleanedText ? splitAiReplyBubbles(cleanedText, input.keepPeriods) : [];
  return {
    data,
    messages: bubbles.map((bubbleText, index) => createCharacterTextMessage({
      id: input.createId(index), characterId: input.characterId,
      content: input.transformBubble ? input.transformBubble(bubbleText, index) : bubbleText,
      timestamp: input.currentTime(index),
    })),
  };
}
