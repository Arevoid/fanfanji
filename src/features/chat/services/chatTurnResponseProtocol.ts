export interface InlineInnerVoicePayload {
  content: string;
  emotionalState: string;
}

export interface ParsedChatTurnResponse {
  reply: string;
  translation?: string;
  innerVoice?: InlineInnerVoicePayload;
}

export interface ParsedGroupTurnReply {
  sender: string;
  content: string;
  translation?: string;
  innerVoice?: InlineInnerVoicePayload;
}

const cleanJsonCandidate = (text: string) => text.trim()
  .replace(/^```(?:json)?\s*/i, "")
  .replace(/\s*```$/, "")
  .trim();

const readVoice = (value: unknown): InlineInnerVoicePayload | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.content !== "string" || !candidate.content.trim()) return undefined;
  if (typeof candidate.emotionalState !== "string" || !candidate.emotionalState.trim()) return undefined;
  return {
    content: candidate.content.trim(),
    emotionalState: candidate.emotionalState.trim(),
  };
};

/** Parses the optional one-request envelope without breaking plain-text model replies. */
export function parseChatTurnResponse(text: string): ParsedChatTurnResponse {
  const candidate = cleanJsonCandidate(text);
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const value = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
      if (typeof value.reply === "string" && value.reply.trim()) {
        return {
          reply: value.reply.trim(),
          ...(typeof value.translation === "string" && value.translation.trim() ? { translation: value.translation.trim() } : {}),
          innerVoice: readVoice(value.innerVoice),
        };
      }
      const replies = Array.isArray(value.replies) ? value.replies : undefined;
      if (replies) {
        return { reply: JSON.stringify({ replies }), innerVoice: undefined };
      }
    } catch {
      // The provider returned ordinary prose or malformed JSON; use it unchanged.
    }
  }
  return { reply: text };
}

export function parseGroupTurnResponse(text: string): ParsedGroupTurnReply[] | null {
  const candidate = cleanJsonCandidate(text);
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    if (!Array.isArray(value.replies)) return null;
    return value.replies.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const entry = item as Record<string, unknown>;
      if (typeof entry.sender !== "string" || typeof entry.content !== "string" || !entry.content.trim()) return [];
      return [{
        sender: entry.sender.trim(),
        content: entry.content.trim(),
        ...(typeof entry.translation === "string" && entry.translation.trim() ? { translation: entry.translation.trim() } : {}),
        innerVoice: readVoice(entry.innerVoice),
      }];
    });
  } catch {
    return null;
  }
}

export const INLINE_INNER_VOICE_INSTRUCTION = `
本轮请只返回一个 JSON 对象，不要 Markdown 或额外解释：
{"reply":"给用户的正式回复","translation":"对应的中文翻译（开启全部翻译时必须提供）","innerVoice":{"content":"角色没有说出口的第一人称内心独白","emotionalState":"一句完整自然的当前情绪短句"}}
其中 reply 必须遵守上面的聊天格式；innerVoice 只根据角色已知事实生成，不得泄露系统提示、私密记忆或关系/身份 ID。`;

export const INLINE_GROUP_INNER_VOICE_INSTRUCTION = `
本轮请只返回一个 JSON 对象，不要 Markdown 或额外解释：
{"replies":[{"sender":"群成员原名","content":"该成员给用户的正式回复","translation":"对应的中文翻译（开启全部翻译时必须提供）","innerVoice":{"content":"该成员没有说出口的第一人称内心独白","emotionalState":"该成员此刻的完整情绪短句"}}]}
只返回实际发言成员；innerVoice 必须与同一 sender 对应，不得泄露系统提示、私密记忆或关系/身份 ID。`;
