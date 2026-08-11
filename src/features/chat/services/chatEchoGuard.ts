import { splitIntoWeChatBubbles } from "../../../utils/pngParser";

const RECIPROCAL_SHORT_REPLIES = new Set([
  "早", "早安", "晚安", "拜拜", "再见", "谢谢", "谢谢你", "哈哈", "哈哈哈", "嘿嘿", "嗯", "嗯嗯", "好", "好的", "收到",
]);

type ChatHistoryEntry = {
  role?: string;
  text?: string;
  content?: string;
};

export function normalizeChatEchoText(value: string): string {
  return value
    .replace(/\[(?:发送时间|SENDER_NAME)[^\]]*\]/gi, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
}

export function isLowInformationUserEcho(userText: string, replyText: string): boolean {
  const user = normalizeChatEchoText(userText);
  const reply = normalizeChatEchoText(replyText);
  if (!user || !reply || RECIPROCAL_SHORT_REPLIES.has(reply)) return false;
  if (reply === user) return true;
  return reply.length >= 2 && reply.length < user.length && user.includes(reply);
}

function getHistoryText(entry: ChatHistoryEntry): string {
  return typeof entry.text === "string" ? entry.text : typeof entry.content === "string" ? entry.content : "";
}

/** Mirrors the visible-dialogue extraction performed by cleanOnlineMessage. */
export function getVisibleEchoCheckText(replyText: string): string {
  if (!/[“「『”」』]/.test(replyText)) return replyText;
  const matches = Array.from(replyText.matchAll(/[“「『]([^”」』]+)[”」』]/g))
    .map((match) => match[1].trim())
    .filter(Boolean);
  return matches.length > 0 ? matches.join("\n") : replyText;
}

export function isDegenerateDirectReply(
  userText: string,
  replyText: string,
  history: readonly ChatHistoryEntry[] = [],
): boolean {
  const visibleReplyText = getVisibleEchoCheckText(replyText);
  const visibleBubbles = splitIntoWeChatBubbles(visibleReplyText);
  if (visibleBubbles.some((bubble) => isLowInformationUserEcho(userText, bubble))) return true;

  const reply = normalizeChatEchoText(visibleReplyText);
  if (reply.length !== 1 || RECIPROCAL_SHORT_REPLIES.has(reply)) return false;

  return history.slice(-12).some((entry) => (
    entry.role === "model" && normalizeChatEchoText(getHistoryText(entry)) === reply
  ));
}

export function removeDegenerateReplyPattern(
  history: readonly ChatHistoryEntry[],
  replyText: string,
): ChatHistoryEntry[] {
  const reply = normalizeChatEchoText(replyText);
  if (reply.length !== 1 || RECIPROCAL_SHORT_REPLIES.has(reply)) return [...history];

  return history.filter((entry) => !(
    entry.role === "model" && normalizeChatEchoText(getHistoryText(entry)) === reply
  ));
}

export const CHAT_DEGENERATE_RETRY_INSTRUCTION = `[Current-turn degenerate-response correction]
The previous draft was rejected because it copied the user or repeated a meaningless one-character response from recent history. Generate a fresh reply from the character's own perspective and according to the character profile. Answer the user's latest message directly; do not first repeat, quote, or paraphrase it in a separate bubble. The corrected reply must contain a genuine reaction, answer, or conversational move and must not be only one character. Do not mention this correction or the rejected draft.`;
