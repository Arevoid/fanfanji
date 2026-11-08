import { createCharacterTextMessage } from "./messageFactory";
import { cleanAiReplyText, normalizeDirectReplyBubbles, normalizePaymentMarkup, removeRedundantCharacterBubbles, splitAiReplyBubbles, stripOuterDialogueQuotes, stripSimulatedUserTurns } from "./messageParser";
import { ensureExplicitStickerDelivery, suppressCharacterEmoji } from "./characterEmojiPolicy";
import type { ReplyCandidateContext, ReplyCandidatesResult } from "./chatServiceTypes";
import { containsNonChineseText } from "../../../utils/textLanguage";
import { normalizeVoiceTranslation } from "./voiceMessageContent";
import { sanitizeCharacterActionText } from "./characterActionProtocol";
import { splitModelDirectBubbles } from "./modelDirectBubbles";

export function createDirectReplyCandidates(context: ReplyCandidateContext): ReplyCandidatesResult {
  const replyText = sanitizeCharacterActionText(ensureExplicitStickerDelivery(context.rawText, context.requestedStickerMessage));
  // Attachment cards are executable message metadata, not dialogue. Keep
  // their complete lines out of quote/narration cleanup so a Chinese-quoted
  // reply cannot accidentally erase an already validated red packet,
  // transfer, location, voice, file, music, or sticker card.
  const attachmentLinePattern = /^\[(?:红包|微信红包|转账|微信转账|位置|文件|音乐|语音|表情)\]\|.+$/u;
  const attachmentLines = replyText.split(/\r?\n/u).map((line) => line.trim())
    .filter((line) => attachmentLinePattern.test(line))
    .map(normalizePaymentMarkup);
  const dialogueText = replyText.split(/\r?\n/u).filter((line) => !attachmentLinePattern.test(line.trim())).join("\n");
  const cleanedDialogue = normalizePaymentMarkup(suppressCharacterEmoji(
    stripSimulatedUserTurns(stripOuterDialogueQuotes(cleanAiReplyText(dialogueText, context.disableBracketActions, context.preserveProse)), context),
    context.allowEmoji,
  ));
  const cleanedText = [cleanedDialogue, ...attachmentLines].filter(Boolean).join("\n\n");
  // Never fall back to rawText here: it may consist solely of a model's fake
  // “sent a photo” claim that the parser intentionally removed.
  let bubbles = cleanedText
    ? context.preserveProse ? splitModelDirectBubbles(cleanedText)
      : normalizeDirectReplyBubbles(removeRedundantCharacterBubbles(splitAiReplyBubbles(cleanedText, context.keepPeriods).map(normalizePaymentMarkup)), context.keepPeriods)
    : [];
  // Chinese replies never display a translation. A redundant translation field
  // must therefore not collapse their otherwise valid paragraph boundaries.
  const needsTranslation = containsNonChineseText(cleanedText);
  let translatedBubbles = context.translationText && needsTranslation
    ? context.preserveProse ? splitModelDirectBubbles(sanitizeCharacterActionText(context.translationText))
      : splitAiReplyBubbles(sanitizeCharacterActionText(context.translationText), context.keepPeriods).map(normalizePaymentMarkup)
    : [];
  // Pair natural paragraphs only when both languages have matching blocks.
  // If they differ, keep the complete pair rather than misassign translations.
  if (translatedBubbles.length > 0 && translatedBubbles.length !== bubbles.length) {
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
