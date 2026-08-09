const RECIPROCAL_SHORT_REPLIES = new Set([
  "早", "早安", "晚安", "拜拜", "再见", "谢谢", "谢谢你", "哈哈", "哈哈哈", "嘿嘿", "嗯", "嗯嗯", "好", "好的", "收到",
]);

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

export const CHAT_ECHO_RETRY_INSTRUCTION = `[Current-turn response correction]
The previous draft merely copied all or part of the user's newest wording. Respond to what the user means from the character's own perspective. Add a genuine reaction, answer, or next conversational move; do not repeat the user's first-person statement as the character's own words. Do not mention this correction or the previous draft.`;
