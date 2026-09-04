import { createId } from "../../core/id/createId";
import type { CharacterPhoneRecord, CharacterPhoneThreadMessage } from "../../domain/characterPhone/types";
import type { Character } from "../../types";

export function appendCharacterPhoneThreadMessage(input: {
  phone: CharacterPhoneRecord;
  contactId: string;
  content: string;
  operatedByUser?: boolean;
  sourceMessageId?: string;
  character?: Character;
  now?: number;
}): CharacterPhoneRecord {
  const now = input.now ?? Date.now();
  const contact = (input.phone.contacts ?? []).find((item) => item.id === input.contactId);
  const message: CharacterPhoneThreadMessage = {
    id: createId("phone-thread-message"),
    contactId: input.contactId,
    sender: "character",
    content: input.content.trim().slice(0, 1000),
    timestamp: now,
    ...(input.operatedByUser ? { operatedByUser: true } : {}),
    ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
  };
  return {
    ...input.phone,
    threadMessages: [...(input.phone.threadMessages ?? []), message],
    activities: [...input.phone.activities, { id: createId("phone-activity"), type: "user_edit", label: `以角色身份向${contact?.kind === "group" ? "群聊" : "联系人"}发送消息${input.operatedByUser ? "（用户操作）" : ""}`, timestamp: now, relatedToUser: Boolean(input.operatedByUser) }],
    updatedAt: now,
  };
}

export function listCharacterPhoneThreadMessages(phone: CharacterPhoneRecord, contactId: string) {
  return (phone.threadMessages ?? []).filter((message) => message.contactId === contactId).sort((a, b) => a.timestamp - b.timestamp);
}
