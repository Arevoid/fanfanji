import { cleanOnlineMessage, splitIntoWeChatBubbles } from "../../../utils/pngParser";
import type { ChatMessageVisualType, CallTranscriptItem, VoiceCallDirection, VoiceCallRecord, VoiceCallStatus } from "./messageTypes";

export type { CallTranscriptItem } from "./messageTypes";

/** Internal scheduling metadata can be supplied to a model, but is never chat content. */
const INTERNAL_DELIVERY_MARKER = /\[\s*(?:消息发送于|消息发送时间|消息时间|历史发送时间|发送于|发送时间)\s*(?:[:：]\s*)?[^\]]*(?:\d{1,2}\s*[:：]\s*\d{2})[^\]]*\]/gi;
// Date/time context is retained in Message records for ordering and model
// context, but must never render as a user-facing chat bubble. This removes
// named date-and-clock blocks while leaving the underlying timestamp intact.
const INTERNAL_NAMED_TIMESTAMP_MARKER = /\[\s*(?:历史时间|当前时间|本地时间|现实时间|时间戳|消息时间|发送时间)\s*(?:[:：]\s*)?[^\]]*(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2})[^\]]*(?:\d{1,2}\s*[:：]\s*\d{2})[^\]]*\]/gi;
const INTERNAL_DATE_TIMESTAMP_MARKER = /\[\s*(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2})\s+(?:上午|下午|早上|晚上)?\s*\d{1,2}\s*[:：]\s*\d{2}[^\]]*\]/gi;
const INTERNAL_STANDALONE_CLOCK_MARKER = /(^|\n)[\t ]*[\[【（(]\s*(?:(?:上午|下午|早上|晚上)\s*)?(?:[01]?\d|2[0-3])\s*[:：]\s*[0-5]\d(?:\s*[:：]\s*[0-5]\d)?\s*[\]】）)][\t ]*(?=\n|$)/gim;
const INTERNAL_RELATIVE_SECOND_MARKER = /(^|\n)[\t ]*\[\s*第\s*\d{1,4}\s*秒\s*\][\t ]*(?=\n|$)/gim;

export function stripInternalDeliveryMarkers(text: string): string {
  return text
    .replace(INTERNAL_DELIVERY_MARKER, "")
    .replace(INTERNAL_NAMED_TIMESTAMP_MARKER, "")
    .replace(INTERNAL_DATE_TIMESTAMP_MARKER, "")
    // Models occasionally copy the clock portion of hidden history metadata
    // as a standalone bubble, for example "[15:10]". Only remove a complete
    // metadata line; conversational text such as "15:10见" remains intact.
    .replace(INTERNAL_STANDALONE_CLOCK_MARKER, "$1")
    // Models may expose response pacing such as "[第2秒]". It is neither a
    // message nor the structured Message.timestamp, so hide only a full line.
    .replace(INTERNAL_RELATIVE_SECOND_MARKER, "$1")
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

const TEXT_IMAGE_PREFIX = "[文字图]|";

export const createTextImageMarkup = (description: string): string =>
  `${TEXT_IMAGE_PREFIX}${encodeURIComponent(description.trim())}`;

export const parseTextImageDescription = (content: string): string | null => {
  if (!content.startsWith(TEXT_IMAGE_PREFIX)) return null;
  const encoded = content.slice(TEXT_IMAGE_PREFIX.length);
  try {
    return decodeURIComponent(encoded).trim();
  } catch {
    return encoded.trim();
  }
};

export function getChatMessageVisualType(content: string): ChatMessageVisualType {
  if (content.startsWith("data:image/")) return "image";
  if (content.startsWith(TEXT_IMAGE_PREFIX)) return "text-image";
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

const CALL_STATUSES = new Set<VoiceCallStatus>(["completed", "rejected", "cancelled"]);
const CALL_DIRECTIONS = new Set<VoiceCallDirection>(["incoming", "outgoing"]);

export function createCallRecordMarkup(input: VoiceCallRecord): string {
  return [
    "[通话记录]",
    input.callType,
    input.status,
    input.direction,
    input.duration,
    encodeURIComponent(JSON.stringify(input.transcript)),
  ].join("|");
}

/** Parses the status-aware format while retaining every existing duration-only record. */
export function parseCallRecord(content: string): VoiceCallRecord {
  const parts = content.split("|");
  const callType = parts[1] || "语音通话";
  const hasStructuredResult = CALL_STATUSES.has(parts[2] as VoiceCallStatus)
    && CALL_DIRECTIONS.has(parts[3] as VoiceCallDirection);
  const status = hasStructuredResult ? parts[2] as VoiceCallStatus : "completed";
  const direction = hasStructuredResult ? parts[3] as VoiceCallDirection : "outgoing";
  const duration = (hasStructuredResult ? parts[4] : parts[2]) || "00:00";
  const encodedTranscript = (hasStructuredResult ? parts[5] : parts[3]) || "";
  try {
    const transcript = JSON.parse(decodeURIComponent(encodedTranscript));
    return { callType, status, direction, duration, transcript: Array.isArray(transcript) ? transcript as CallTranscriptItem[] : [] };
  } catch {
    return { callType, status, direction, duration, transcript: [] };
  }
}

export function formatCallRecordHistory(
  content: string,
  options: { userName?: string; characterName?: string; includeTranscript?: boolean } = {},
): string | null {
  if (!isCallRecordMarkup(content)) return null;

  const call = parseCallRecord(content);
  const userName = options.userName?.trim() || "用户";
  const characterName = options.characterName?.trim() || "角色";
  const direction = call.direction === "incoming" ? `${characterName}发起` : `${userName}发起`;

  if (call.status !== "completed") {
    const result = call.status === "rejected" ? "已拒绝" : "已取消";
    return `[${call.callType}，${direction}，${result}]`;
  }

  const header = `[已完成${call.callType}，${direction}，时长 ${call.duration}。这是与后续消息连续的真实通话记录]`;
  if (options.includeTranscript === false) return header;

  const transcript = call.transcript
    .map((item) => {
      const text = getCallTranscriptText(item.content || "").trim();
      if (!text) return "";
      return `${item.sender === "user" ? userName : characterName}：${text}`;
    })
    .filter(Boolean);

  return transcript.length > 0 ? `${header}\n${transcript.join("\n")}` : header;
}
