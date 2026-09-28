import { createCharacterTextMessage } from "./messageFactory";
import { cleanAiReplyText, normalizeDirectReplyBubbles, normalizePaymentMarkup, removeRedundantCharacterBubbles, splitAiReplyBubbles, stripOuterDialogueQuotes, stripSimulatedUserTurns } from "./messageParser";
import { ensureExplicitStickerDelivery, suppressCharacterEmoji } from "./characterEmojiPolicy";
import type { ReplyCandidateContext, ReplyCandidatesResult } from "./chatServiceTypes";

/** Regeneration preserves its legacy non-payment-normalizing parse path. */
export function createRegeneratedReplyCandidates(context: ReplyCandidateContext): ReplyCandidatesResult {
  const replyText = ensureExplicitStickerDelivery(context.rawText, context.requestedStickerMessage);
  const cleanedText = normalizePaymentMarkup(suppressCharacterEmoji(
    stripSimulatedUserTurns(stripOuterDialogueQuotes(cleanAiReplyText(replyText, context.disableBracketActions)), context),
    context.allowEmoji,
  ));
  // Never restore raw model output after the sanitizer intentionally removed
  // an internal-only marker. Otherwise a marker-only reply becomes a bubble.
  const bubbles = cleanedText
    ? normalizeDirectReplyBubbles(removeRedundantCharacterBubbles(splitAiReplyBubbles(cleanedText, context.keepPeriods).map(normalizePaymentMarkup)), context.keepPeriods)
    : [];
  return {
    cleanedText,
    bubbleTexts: bubbles,
    messages: bubbles.map((bubbleText, index) => createCharacterTextMessage({
      id: context.createId(index),
      characterId: context.characterId,
      replyBatchId: context.replyBatchId,
      content: context.transformBubble ? context.transformBubble(bubbleText, index) : bubbleText,
      timestamp: context.currentTime(index),
    })),
  };
}
