import { createCharacterTextMessage } from "./messageFactory";
import { cleanAiReplyText, normalizePaymentMarkup, splitAiReplyBubbles } from "./messageParser";
import type { ReplyCandidateContext, ReplyCandidatesResult } from "./chatServiceTypes";

export function createDirectReplyCandidates(context: ReplyCandidateContext): ReplyCandidatesResult {
  const cleanedText = normalizePaymentMarkup(cleanAiReplyText(context.rawText, context.disableBracketActions));
  const bubbles = splitAiReplyBubbles(cleanedText || context.rawText, context.keepPeriods);
  return {
    cleanedText,
    bubbleTexts: bubbles,
    messages: bubbles.map((bubbleText, index) => createCharacterTextMessage({
      id: context.createId(index),
      characterId: context.characterId,
      content: context.transformBubble ? context.transformBubble(bubbleText, index) : bubbleText,
      timestamp: context.currentTime(index),
    })),
  };
}
