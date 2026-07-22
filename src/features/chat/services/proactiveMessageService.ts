import type { apiChat } from "../../../utils/apiHelper";
import type { Message } from "../../../types";
import { requestAiReply } from "./aiReplyService";
import { createCharacterTextMessage } from "./messageFactory";
import { cleanAiReplyText, splitAiReplyBubbles } from "./messageParser";
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
}): Promise<{ data: Awaited<ReturnType<typeof import("../../../utils/apiHelper").apiChat>>; messages: Message[] }> {
  const data = await requestAiReply(input.requestAi, input.request);
  if (!data?.text) return { data, messages: [] };
  const cleanedText = cleanAiReplyText(data.text, input.disableBracketActions);
  const bubbles = splitAiReplyBubbles(cleanedText || data.text, input.keepPeriods);
  return {
    data,
    messages: bubbles.map((bubbleText, index) => createCharacterTextMessage({
      id: input.createId(index), characterId: input.characterId,
      content: input.transformBubble ? input.transformBubble(bubbleText, index) : bubbleText,
      timestamp: input.currentTime(index),
    })),
  };
}
