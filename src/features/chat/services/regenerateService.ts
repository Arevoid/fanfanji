import { createCharacterTextMessage } from "./messageFactory";
import { cleanAiReplyText, splitAiReplyBubbles } from "./messageParser";
import type { ReplyCandidateContext, ReplyCandidatesResult } from "./chatServiceTypes";

/** Regeneration preserves its legacy non-payment-normalizing parse path. */
export function createRegeneratedReplyCandidates(context: ReplyCandidateContext): ReplyCandidatesResult {
  const cleanedText = cleanAiReplyText(context.rawText, context.disableBracketActions);
  // Never restore raw model output after the sanitizer intentionally removed
  // an internal-only marker. Otherwise a marker-only reply becomes a bubble.
  const bubbles = cleanedText ? splitAiReplyBubbles(cleanedText, context.keepPeriods) : [];
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
