import { createCharacterTextMessage } from "./messageFactory";
import { cleanAiReplyText, splitAiReplyBubbles } from "./messageParser";
import type { ReplyCandidateContext, ReplyCandidatesResult } from "./chatServiceTypes";

/** Regeneration preserves its legacy non-payment-normalizing parse path. */
export function createRegeneratedReplyCandidates(context: ReplyCandidateContext): ReplyCandidatesResult {
  const cleanedText = cleanAiReplyText(context.rawText, context.disableBracketActions);
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
