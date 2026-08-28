import { createId } from "../../core/id/createId";
import type { CharacterPhoneRecord, CharacterPhoneThreadMessage } from "../../domain/characterPhone/types";

export function appendCharacterPhoneThreadMessage(input: {
  phone: CharacterPhoneRecord;
  contactId: string;
  content: string;
  operatedByUser?: boolean;
  now?: number;
}): CharacterPhoneRecord {
  const now = input.now ?? Date.now();
  const message: CharacterPhoneThreadMessage = {
    id: createId("phone-thread-message"),
    contactId: input.contactId,
    sender: "character",
    content: input.content.trim().slice(0, 1000),
    timestamp: now,
    ...(input.operatedByUser ? { operatedByUser: true } : {}),
  };
  const previousThread = (input.phone.threadMessages ?? []).filter((item) => item.contactId === input.contactId);
  const contact = (input.phone.contacts ?? []).find((item) => item.id === input.contactId);
  const shouldUpgradeNpc = Boolean(contact && !contact.isLongTerm && previousThread.length + 1 >= 3);
  const reply: CharacterPhoneThreadMessage = {
    id: createId("phone-thread-reply"),
    contactId: input.contactId,
    sender: "contact",
    content: /想你|见面|喜欢/.test(message.content) ? "你今天怎么突然说这个？我有点不知道该怎么回。" : "看到了，晚点再和你说。我这边刚好有点忙。",
    timestamp: now + 1000 * 30,
    ...(previousThread.length >= 2 ? { attachment: { kind: "screenshot" as const, label: "聊天记录截图", content: "刚才的聊天记录 · 角色手机自动生成的截图卡片" } } : {}),
  };
  return {
    ...input.phone,
    contacts: (input.phone.contacts ?? []).map((item) => item.id === input.contactId && shouldUpgradeNpc ? { ...item, isLongTerm: true } : item),
    threadMessages: [...(input.phone.threadMessages ?? []), message, reply],
    activities: [...input.phone.activities, { id: createId("phone-activity"), type: "user_edit", label: `以角色身份向联系人发送消息${input.operatedByUser ? "（用户操作）" : ""}`, timestamp: now, relatedToUser: Boolean(input.operatedByUser) }, ...(shouldUpgradeNpc ? [{ id: createId("phone-activity"), type: "user_edit" as const, label: `${contact?.name || "联系人"} 已因频繁互动升级为长期 NPC`, timestamp: now, relatedToUser: true }] : [])],
    updatedAt: now,
  };
}

export function listCharacterPhoneThreadMessages(phone: CharacterPhoneRecord, contactId: string) {
  return (phone.threadMessages ?? []).filter((message) => message.contactId === contactId).sort((a, b) => a.timestamp - b.timestamp);
}
