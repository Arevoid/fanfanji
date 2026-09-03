import { createCharacterTextMessage } from "./messageFactory";
import { cleanAiReplyText, normalizePaymentMarkup, removeRedundantCharacterBubbles, splitAiReplyBubbles, stripSimulatedUserTurns } from "./messageParser";
import { suppressCharacterEmoji } from "./characterEmojiPolicy";
import type { ReplyCandidateContext, ReplyCandidatesResult } from "./chatServiceTypes";

/** Regeneration preserves its legacy non-payment-normalizing parse path. */
export function createRegeneratedReplyCandidates(context: ReplyCandidateContext): ReplyCandidatesResult {
  const cleanedText = normalizePaymentMarkup(suppressCharacterEmoji(
    stripSimulatedUserTurns(cleanAiReplyText(context.rawText, context.disableBracketActions), context),
    context.allowEmoji,
  ));
  // Never restore raw model output after the sanitizer intentionally removed
  // an internal-only marker. Otherwise a marker-only reply becomes a bubble.
  const bubbles = cleanedText
    ? removeRedundantCharacterBubbles(splitAiReplyBubbles(cleanedText, context.keepPeriods).map(normalizePaymentMarkup))
    : [];
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
