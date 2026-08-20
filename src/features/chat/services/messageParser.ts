import { cleanOnlineMessage, splitIntoWeChatBubbles } from "../../../utils/pngParser";
import type { ChatMessageVisualType, CallTranscriptItem, VoiceCallDirection, VoiceCallRecord, VoiceCallStatus } from "./messageTypes";

export type { CallTranscriptItem } from "./messageTypes";

/** Internal scheduling metadata can be supplied to a model, but is never chat content. */
const INTERNAL_DELIVERY_MARKER = /\[\s*(?:消息发送于|消息发送时间|消息时间|历史发送时间|发送于|发送时间)\s*(?:[:：]\s*)?[^\]]*(?:\d{1,2}\s*[:：]\s*\d{2})[^\]]*\]/gi;
// Date/time context is retained in Message records for ordering and model
// context, but must never render as a user-facing chat bubble. This removes
// named date-and-clock blocks while leaving the underlying timestamp intact.
const INTERNAL_NAMED_TIMESTAMP_MARKER = /\[\s*(?:历史发送时间|历史时间|当前时间|本地时间|现实时间|时间戳|消息时间|发送时间|时间)\s*(?:[:：]\s*)?[^\]]*(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2})[^\]]*(?:\d{1,2}\s*[:：]\s*\d{2})[^\]]*\]/gi;
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

/**
 * Remove accidental same-turn re-statements before bubbles are persisted.
 * Models sometimes answer an arrival/hand-off question twice using slightly
 * different wording (for example “哥下来了” followed by “哥下楼了”).  These
 * are one conversational move, not two messages.  Keep the first bubble and
 * only collapse a narrowly-scoped arrival variant plus exact normalized
 * duplicates so ordinary short replies remain untouched.
 */
export function removeRedundantCharacterBubbles(bubbles: readonly string[]): string[] {
  const normalize = (value: string) => value
    .replace(/^[嗯啊哦好行那就，,、\s]+/u, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
  const normalizeArrival = (value: string): string | null => {
    if (!/(?:哥|哥哥|我)?(?:下来了|下楼了|下去接你了|在楼下|到楼下了|到门口了)/u.test(value)) return null;
    return "arrival-handoff";
  };
  const result: string[] = [];
  const seen = new Set<string>();
  let arrivalSeen = false;
  for (const bubble of bubbles) {
    const normalized = normalize(bubble);
    if (!normalized) continue;
    const arrival = normalizeArrival(normalized);
    if (arrival) {
      if (arrivalSeen) continue;
      arrivalSeen = true;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(bubble);
  }
  return result;
}

/**
 * A direct-chat completion is one character turn. If a model nevertheless
 * writes a labelled user turn, stop before it so the client never persists an
 * invented user reply and the character cannot answer that invented reply.
 */
export function stripSimulatedUserTurns(text: string, options: { userName?: string; characterName?: string } = {}): string {
  const normalizeLabel = (value: string) => value.trim().replace(/^[\[【（(]|[\]】）)]$/g, "").toLowerCase();
  const userLabels = new Set(["用户", "user", "{{user}}", "我（用户）", options.userName || ""].filter(Boolean).map(normalizeLabel));
  const characterLabels = new Set(["角色", "assistant", "model", "{{char}}", options.characterName || ""].filter(Boolean).map(normalizeLabel));
  const kept: string[] = [];

  for (const originalLine of text.split(/\r?\n/)) {
    const match = originalLine.match(/^\s*([^：:\n]{1,24})\s*[：:]\s*(.*)$/);
    if (!match) {
      kept.push(originalLine);
      continue;
    }
    const label = normalizeLabel(match[1]);
    if (userLabels.has(label)) break;
    kept.push(characterLabels.has(label) ? match[2] : originalLine);
  }
  return kept.join("\n").trim();
}

const DEFAULT_RED_PACKET_AMOUNT = "8.88";
const DEFAULT_RED_PACKET_GREETING = "恭喜发财，万事如意";
const RED_PACKET_AMOUNT_PLACEHOLDER = /^(?:金额|红包金额|金额数字|数额|amount|money|待定|未知|未填写|请输入金额)$/iu;

/**
 * Models occasionally copy the format placeholder literally (for example
 * `[红包]|金额|恭喜发财`). Keep the persisted markup renderable and stable by
 * accepting currency suffixes, while replacing non-numeric placeholders with
 * a safe fallback amount.
 */
export function normalizeRedPacketAmount(value: unknown, fallback = DEFAULT_RED_PACKET_AMOUNT): string {
  const raw = String(value ?? "").trim().replace(/^[¥￥]\s*/u, "");
  if (!raw || RED_PACKET_AMOUNT_PLACEHOLDER.test(raw)) return fallback;
  const match = raw.match(/\d+(?:\.\d{1,2})?/u);
  if (!match) return fallback;
  const amount = Number(match[0]);
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : fallback;
}

/** Normalize both legacy aliases and malformed model-generated red packets. */
export function normalizeRedPacketMarkup(content: string): string {
  const normalized = content.trim().replace(/^\[微信红包\]/u, "[红包]");
  if (!normalized.startsWith("[红包]")) return normalized;
  const parts = normalized.split("|");
  const amount = normalizeRedPacketAmount(parts[1]);
  const greeting = parts.slice(2).join("|").trim() || DEFAULT_RED_PACKET_GREETING;
  return `[红包]|${amount}|${greeting}`;
}

export const normalizePaymentMarkup = (content: string): string => normalizeRedPacketMarkup(content)
  .replace(/^\[微信转账\]/u, "[转账]");

export const isRedPacketMarkup = (content: string): boolean => /^\[(?:红包|微信红包)\]/.test(content.trim());
export const isTransferMarkup = (content: string): boolean => /^\[(?:转账|微信转账)\]/.test(content);
export const isCallRecordMarkup = (content: string): boolean => /^\[通话记录\]\|/.test(content);

export interface RedPacketClaimNotice {
  claimantName: string;
  senderName: string;
}

export function parseRedPacketClaimNotice(content: string): RedPacketClaimNotice | null {
  const normalized = content.trim();
  const matched = normalized.match(/^\[红包消息：(.+?)领取了(.+?)的红包\]$/u);
  if (matched) return { claimantName: matched[1].trim(), senderName: matched[2].trim() };

  // Models often emit a natural-language claim such as “领了” instead of
  // the structured notice. Do not treat invitations or prohibitions as a
  // claim: “快点领”, “不许领”, and “别领他的” are not settlement events.
  if (/(?:不许|不准|不能|别|不要|禁止|快点|赶紧)[^。！？\n]{0,16}(?:领|抢|拆)/u.test(normalized)) return null;
  if (!/(?:领了|领取了|领到|抢到了|抢到|拆开了|拆了|收了|收到|拿到了|拿到)/u.test(normalized)) return null;
  return { claimantName: "", senderName: "" };
}

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

export interface CallRecordHistoryTurn {
  role: "user" | "model";
  text: string;
  timestamp: number;
}

/**
 * Expands a persisted call into role-correct API turns. A call record's outer
 * Message.sender only identifies who started the call; it must never own every
 * line in the transcript.
 */
export function expandCallRecordHistory(
  content: string,
  fallbackTimestamp: number,
  options: { userName?: string; characterName?: string } = {},
): CallRecordHistoryTurn[] | null {
  if (!isCallRecordMarkup(content)) return null;

  const call = parseCallRecord(content);
  if (call.status === "completed") {
    const transcriptTurns = call.transcript
      .map((item): CallRecordHistoryTurn | null => {
        const text = getCallTranscriptText(item.content || "").trim();
        if (!text) return null;
        return {
          role: item.sender === "user" ? "user" : "model",
          text,
          timestamp: Number.isFinite(item.timestamp) ? item.timestamp : fallbackTimestamp,
        };
      })
      .filter((item): item is CallRecordHistoryTurn => Boolean(item));
    if (transcriptTurns.length > 0) return transcriptTurns;
  }

  return [{
    role: call.direction === "incoming" ? "model" : "user",
    text: formatCallRecordHistory(content, { ...options, includeTranscript: false }) || `[${call.callType}]`,
    timestamp: fallbackTimestamp,
  }];
}
