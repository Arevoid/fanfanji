import { cleanOnlineMessage, splitIntoWeChatBubbles } from "../../../utils/pngParser";
import type { ChatMessageVisualType, CallTranscriptItem } from "./messageTypes";

export type { CallTranscriptItem } from "./messageTypes";

/** Internal scheduling metadata can be supplied to a model, but is never chat content. */
const INTERNAL_DELIVERY_MARKER = /\[\s*(?:发送于|发送时间|历史发送时间)\s*[:：]\s*[^\]]+\]/gi;
const INTERNAL_STANDALONE_CLOCK_MARKER = /(^|\n)[\t ]*[\[【（(]\s*(?:(?:上午|下午|早上|晚上)\s*)?(?:[01]?\d|2[0-3])\s*[:：]\s*[0-5]\d(?:\s*[:：]\s*[0-5]\d)?\s*[\]】）)][\t ]*(?=\n|$)/gim;

export function stripInternalDeliveryMarkers(text: string): string {
  return text
    .replace(INTERNAL_DELIVERY_MARKER, "")
    // Models occasionally copy the clock portion of hidden history metadata
    // as a standalone bubble, for example "[15:10]". Only remove a complete
    // metadata line; conversational text such as "15:10见" remains intact.
    .replace(INTERNAL_STANDALONE_CLOCK_MARKER, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isInternalDeliveryMarkerOnly(text: string): boolean {
  return Boolean(text.trim()) && !stripInternalDeliveryMarkers(text);
}

/** A text model cannot create a real image Message. Remove any claim that it sent one. */
export function removeFakeImageNarration(text: string): string {
  const image = "(?:图片|照片|图像|相片|自拍(?:照)?)";
  const parenthesized = new RegExp(`[（(]\\s*(?:(?:给你)?(?:发送|发来|发出|传来|拍了?|给你拍了?).{0,14}${image}|(?:一张|张).{0,8}${image})[^）)]*[）)]`, "gi");
  const plainClaim = new RegExp(`(?:我|角色)?(?:已经|已)?(?:给你)?(?:发送|发来|发出|传了|拍了?)(?:了)?(?:一张|张)?(?:我的|你要的)?.{0,6}${image}(?:给你|了)?`, "gi");
  // Only remove standalone fake-operation lines. A normal sentence such as
  // “我在翻相册，看到以前的照片” remains ordinary conversation content.
  const fakePreparationSequence = /(?:^|\n)(?:等会[，,、…\s]*)?(?:我在翻相册|我去翻相册|我找找相册)(?:[，,、…\s]*(?:就这张(?:吧|了)?|这张发给你|给你看这张))?(?=\n|$)/gim;
  const fakePreparationLine = /^(?:等会[，,、… ]*)?(?:我在翻相册|我去翻相册|我找找相册|就这张(?:吧|了)?|这张发给你|给你看这张)[。！!…]*$/gim;
  return stripInternalDeliveryMarkers(text)
    .replace(parenthesized, "")
    .replace(plainClaim, "")
    .replace(fakePreparationSequence, "")
    .replace(fakePreparationLine, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const cleanAiReplyText = (text: string, disableBracketActions: boolean): string =>
  removeFakeImageNarration(cleanOnlineMessage(removeFakeImageNarration(text), disableBracketActions));
export const splitAiReplyBubbles = splitIntoWeChatBubbles;

export const normalizePaymentMarkup = (content: string): string => content
  .replace(/^\[微信红包\]/, "[红包]")
  .replace(/^\[微信转账\]/, "[转账]");

export const isRedPacketMarkup = (content: string): boolean => /^\[(?:红包|微信红包)\]/.test(content);
export const isTransferMarkup = (content: string): boolean => /^\[(?:转账|微信转账)\]/.test(content);
export const isCallRecordMarkup = (content: string): boolean => /^\[通话记录\]\|/.test(content);

export function getChatMessageVisualType(content: string): ChatMessageVisualType {
  if (content.startsWith("data:image/")) return "image";
  if (content.startsWith("[表情]|")) return "sticker";
  if (content.startsWith("[红包]")) return "red-packet";
  if (content.startsWith("[转账]")) return "transfer";
  if (content.startsWith("[语音通话]") || content.startsWith("[视频通话]")) return "call";
  if (content.startsWith("[语音")) return "voice";
  if (content.startsWith("[文件]")) return "file";
  if (content.startsWith("[位置]")) return "location";
  return "text";
}

export const getCallTranscriptText = (content: string): string =>
  content.startsWith("[语音]|") ? content.split("|").slice(2).join("|") : content;

export function parseCallRecord(content: string): { callType: string; duration: string; transcript: CallTranscriptItem[] } {
  const [, callType = "语音通话", duration = "00:00", encodedTranscript = ""] = content.split("|");
  try {
    const transcript = JSON.parse(decodeURIComponent(encodedTranscript));
    return { callType, duration, transcript: Array.isArray(transcript) ? transcript as CallTranscriptItem[] : [] };
  } catch {
    return { callType, duration, transcript: [] };
  }
}
