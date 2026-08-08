import { createCharacterTextMessage } from "./messageFactory";
import { cleanAiReplyText, normalizePaymentMarkup, splitAiReplyBubbles } from "./messageParser";
import { suppressCharacterEmoji } from "./characterEmojiPolicy";
import type { ReplyCandidateContext, ReplyCandidatesResult } from "./chatServiceTypes";

export function createDirectReplyCandidates(context: ReplyCandidateContext): ReplyCandidatesResult {
  const cleanedText = normalizePaymentMarkup(suppressCharacterEmoji(
    cleanAiReplyText(context.rawText, context.disableBracketActions),
    context.allowEmoji,
  ));
  // Never fall back to rawText here: it may consist solely of a model's fake
  // “sent a photo” claim that the parser intentionally removed.
  const bubbles = cleanedText ? splitAiReplyBubbles(cleanedText, context.keepPeriods) : [];
  return {
    cleanedText,
    bubbleTexts: bubbles,
    messages: bubbles.map((bubbleText, index) => createCharacterTextMessage({
      id: context.createId(index),
      characterId: context.characterId,
      context: context.context,
      content: context.transformBubble ? context.transformBubble(bubbleText, index) : bubbleText,
      timestamp: context.currentTime(index),
    })),
  };
}
