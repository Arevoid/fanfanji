import type { Message } from "../../types";
const important = /约定|约好|承诺|答应|生日|纪念|重要|过敏|害怕|不再|改为|取消|改期|搬家|住在|生病|照顾|工作|职业|喜欢|讨厌|偏好|计划|准备|打算|一起|周[一二三四五六日天]|\d{4}[-年]/u;
export function shouldArchiveGroupMessage(message: Message, messages: readonly Message[]): boolean {
  const text = message.content.trim().replace(/[\s\p{P}\p{S}]+/gu, "");
  if (!text || /^(?:哈|呵|嗯|哦|好|是|对|早安|晚安|你好|谢谢|收到|知道了|ok|okay)+$/iu.test(text)) return false;
  if (important.test(text) || text.length >= 24) return true;
  if (!/有空|想去|参加|同意|愿意|不去了/u.test(text)) return false;
  return messages.some((previous) => previous.id !== message.id && previous.characterId === message.characterId
    && previous.timestamp <= message.timestamp && message.timestamp - previous.timestamp <= 20 * 60_000
    && /约定|约好|一起|计划|周[一二三四五六日天]/u.test(previous.content));
}
