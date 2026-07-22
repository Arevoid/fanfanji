import { cleanOnlineMessage, splitIntoWeChatBubbles } from "../../../utils/pngParser";
import type { ChatMessageVisualType, CallTranscriptItem } from "./messageTypes";

export type { CallTranscriptItem } from "./messageTypes";

export const cleanAiReplyText = cleanOnlineMessage;
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
