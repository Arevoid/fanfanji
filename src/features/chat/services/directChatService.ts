import { createCharacterTextMessage } from "./messageFactory";
import { cleanAiReplyText, normalizeDirectReplyBubbles, normalizePaymentMarkup, removeRedundantCharacterBubbles, splitAiReplyBubbles, stripOuterDialogueQuotes, stripSimulatedUserTurns } from "./messageParser";
import { ensureExplicitStickerDelivery, suppressCharacterEmoji } from "./characterEmojiPolicy";
import type { ReplyCandidateContext, ReplyCandidatesResult } from "./chatServiceTypes";
import { containsNonChineseText } from "../../../utils/textLanguage";
import { normalizeVoiceTranslation } from "./voiceMessageContent";
import { sanitizeCharacterActionText } from "./characterActionProtocol";

export function createDirectReplyCandidates(context: ReplyCandidateContext): ReplyCandidatesResult {
  const replyText = sanitizeCharacterActionText(ensureExplicitStickerDelivery(context.rawText, context.requestedStickerMessage));
  const cleanedText = normalizePaymentMarkup(suppressCharacterEmoji(
    stripSimulatedUserTurns(stripOuterDialogueQuotes(cleanAiReplyText(replyText, context.disableBracketActions, context.preserveProse)), context),
    context.allowEmoji,
  ));
  // Never fall back to rawText here: it may consist solely of a model's fake
  // “sent a photo” claim that the parser intentionally removed.
  let bubbles = cleanedText
    ? normalizeDirectReplyBubbles(removeRedundantCharacterBubbles(splitAiReplyBubbles(cleanedText, context.keepPeriods).map(normalizePaymentMarkup)), context.keepPeriods)
    : [];
  let translatedBubbles = context.translationText
    ? splitAiReplyBubbles(sanitizeCharacterActionText(context.translationText), context.keepPeriods).map(normalizePaymentMarkup)
    : [];
  // Keep one response/translation pair intact for model chat. Independent
  // paragraph splitting cannot safely pair languages with different lengths.
  if (context.preserveProse || translatedBubbles.length > 0 && translatedBubbles.length !== bubbles.length) {
    bubbles = cleanedText ? [cleanedText] : [];
    translatedBubbles = context.translationText ? [sanitizeCharacterActionText(context.translationText).trim()] : [];
  }
  return {
    cleanedText,
    bubbleTexts: bubbles,
    messages: bubbles.map((bubbleText, index) => createCharacterTextMessage({
      id: context.createId(index),
      characterId: context.characterId,
      replyBatchId: context.replyBatchId,
      context: context.context,
      content: context.transformBubble ? context.transformBubble(bubbleText, index) : bubbleText,
      translation: containsNonChineseText(bubbleText) ? normalizeVoiceTranslation(translatedBubbles[index]) : undefined,
      timestamp: context.currentTime(index),
    })),
  };
}
