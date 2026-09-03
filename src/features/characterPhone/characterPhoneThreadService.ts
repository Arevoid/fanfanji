import { createId } from "../../core/id/createId";
import type { CharacterPhoneRecord, CharacterPhoneThreadMessage } from "../../domain/characterPhone/types";
import type { Character } from "../../types";

function buildPromise(content: string, contactName: string) {
  if (!/(答应|可以|没问题|保证|我会|帮你|到时候|明天|今晚|周[一二三四五六日天])/.test(content)) return undefined;
  const summary = content.replace(/\s+/g, " ").trim().slice(0, 54);
  return { summary: `答应${contactName}：${summary}` };
}

function hasStyleMismatch(content: string, character?: Character): boolean {
  const personality = `${character?.personality || ""} ${character?.backstory || ""}`;
  const emojiCount = (content.match(/[\p{Extended_Pictographic}]/gu) || []).length;
  const overlyFormal = /(您好|请问|非常感谢|敬请|收到您的消息)/.test(content);
  const noisy = /!{2,}|！{2,}|[?？]{2,}|[。]{3,}/.test(content) || emojiCount >= 3;
  const reservedCharacter = /冷静|理性|克制|寡言|沉默/.test(personality);
  const warmCharacter = /温柔|体贴|热情|健谈/.test(personality);
  return overlyFormal || noisy || (reservedCharacter && content.length >= 45) || (warmCharacter && content.length <= 3);
}

export function appendCharacterPhoneThreadMessage(input: {
  phone: CharacterPhoneRecord;
  contactId: string;
  content: string;
  operatedByUser?: boolean;
  character?: Character;
  now?: number;
}): CharacterPhoneRecord {
  const now = input.now ?? Date.now();
  const previousThread = (input.phone.threadMessages ?? []).filter((item) => item.contactId === input.contactId);
  const contact = (input.phone.contacts ?? []).find((item) => item.id === input.contactId);
  const shouldUpgradeNpc = Boolean(contact && !contact.isLongTerm && previousThread.length + 1 >= 3);
  const promise = contact ? buildPromise(input.content.trim().slice(0, 1000), contact.remark || contact.name) : undefined;
  const message: CharacterPhoneThreadMessage = {
    id: createId("phone-thread-message"),
    contactId: input.contactId,
    sender: "character",
    content: input.content.trim().slice(0, 1000),
    timestamp: now,
    ...(input.operatedByUser ? { operatedByUser: true } : {}),
    ...(promise ? { promise } : {}),
  };
  const styleMismatch = Boolean(
    contact && contact.source !== "user" && input.operatedByUser && hasStyleMismatch(message.content, input.character),
  );
  const reply: CharacterPhoneThreadMessage = {
    id: createId("phone-thread-reply"),
    contactId: input.contactId,
    sender: "contact",
    content: styleMismatch
      ? "你今天怎么感觉怪怪的？是遇到什么事了吗？"
      : /想你|见面|喜欢/.test(message.content)
        ? "你今天怎么突然说这个？我有点不知道该怎么回。"
        : "看到了，晚点再和你说。我这边刚好有点忙。",
    timestamp: now + 1000 * 30,
    ...(previousThread.length >= 2 ? { attachment: { kind: "screenshot" as const, label: "聊天记录截图", content: "刚才的聊天记录 · 角色手机自动生成的截图卡片" } } : {}),
  };
  return {
    ...input.phone,
    contacts: (input.phone.contacts ?? []).map((item) => item.id === input.contactId && shouldUpgradeNpc ? { ...item, isLongTerm: true } : item),
    threadMessages: [...(input.phone.threadMessages ?? []), message, reply],
    todos: promise
      ? [{ id: createId("phone-todo"), text: promise.summary, checked: false, source: "chat" as const }, ...(input.phone.todos ?? [])]
      : input.phone.todos,
    activities: [...input.phone.activities, { id: createId("phone-activity"), type: "user_edit", label: `以角色身份向联系人发送消息${input.operatedByUser ? "（用户操作）" : ""}`, timestamp: now, relatedToUser: Boolean(input.operatedByUser) }, ...(shouldUpgradeNpc ? [{ id: createId("phone-activity"), type: "user_edit" as const, label: `${contact?.name || "联系人"} 已因频繁互动升级为长期 NPC`, timestamp: now, relatedToUser: true }] : [])],
    updatedAt: now,
  };
}

export function listCharacterPhoneThreadMessages(phone: CharacterPhoneRecord, contactId: string) {
  return (phone.threadMessages ?? []).filter((message) => message.contactId === contactId).sort((a, b) => a.timestamp - b.timestamp);
}
