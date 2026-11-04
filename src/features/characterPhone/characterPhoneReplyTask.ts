import type { CharacterPhoneContact, CharacterPhoneRecord } from "../../domain/characterPhone/types";
import { appendCharacterPhoneThreadMessage } from "./characterPhoneThreadService";

export function isPhoneUserContact(contact: CharacterPhoneContact): boolean {
  return !contact.linkedCharacterId && !contact.relationshipNetworkNpcId && !contact.isNpc
    && contact.kind !== "npc" && contact.kind !== "character" && contact.kind !== "group"
    && (contact.kind === "user" || contact.source === "user");
}

/** Module-owned queue survives page unmounts. It never persists prompts or credentials. */
const queues = new Map<string, Promise<void>>();
const pending = new Map<string, Promise<void>>();
export const PHONE_REPLY_UPDATED = "character-phone-contact-reply-updated";

export function enqueuePhoneReply(input: {
  phone: CharacterPhoneRecord;
  contactId: string;
  outgoingMessageId: string;
  read: () => CharacterPhoneRecord | undefined;
  save: (phone: CharacterPhoneRecord) => { success: boolean } | Promise<{ success: boolean }>;
  generate: (phone: CharacterPhoneRecord, contact: CharacterPhoneContact) => Promise<string | null>;
  notify: (notice: string, phone?: CharacterPhoneRecord) => void;
}): Promise<void> {
  const key = JSON.stringify([input.phone.ownerIdentityId, input.phone.id, input.contactId]);
  const requestKey = JSON.stringify([key, input.outgoingMessageId]);
  const existing = pending.get(requestKey);
  if (existing) return existing;
  const sourceId = `phone-contact-reply-for-${input.outgoingMessageId}`;
  const eligible = () => {
    const phone = input.read();
    if (!phone || phone.id !== input.phone.id || phone.ownerIdentityId !== input.phone.ownerIdentityId
      || phone.characterId !== input.phone.characterId) return;
    const contact = phone.contacts.find(item => item.id === input.contactId && !item.removedAt && !item.historyOnly);
    const outgoing = phone.threadMessages.find(item => item.id === input.outgoingMessageId
      && item.contactId === input.contactId && item.sender === "character" && !item.recalledAt);
    if (!contact || isPhoneUserContact(contact) || !outgoing
      || phone.threadMessages.some(item => item.sourceMessageId === sourceId)) return;
    return { phone, contact };
  };
  const task = (queues.get(key) || Promise.resolve()).catch(() => undefined).then(async () => {
    try {
      const start = eligible();
      if (!start) return;
      input.notify(`${start.contact.remark || start.contact.name}正在回复…`);
      // Bind this request to its outgoing message, not a newer queued send.
      const index = start.phone.threadMessages.findIndex(item => item.id === input.outgoingMessageId);
      const reply = await input.generate({ ...start.phone, threadMessages: start.phone.threadMessages.filter((message, messageIndex) =>
        messageIndex <= index || message.sender === "contact") }, start.contact);
      if (!reply) throw new Error("模型未返回有效的联系人回复");
      const current = eligible();
      if (!current) { input.notify("消息或联系人已变更，本次回复未保存"); return; }
      const identity = (contact: CharacterPhoneContact) => JSON.stringify([contact.kind, contact.linkedCharacterId, contact.relationshipNetworkNpcId, contact.userIdentityId]);
      if (identity(start.contact) !== identity(current.contact)
        || start.phone.threadMessages[index].content !== current.phone.threadMessages.find(message => message.id === input.outgoingMessageId)?.content) {
        input.notify("消息或联系人已变更，本次回复未保存"); return;
      }
      const next = appendCharacterPhoneThreadMessage({ phone: current.phone, contactId: current.contact.id,
        sender: "contact", content: reply, sourceMessageId: sourceId, recordActivity: false });
      if (!(await input.save(next)).success) throw new Error("联系人回复生成了，但暂时无法保存聊天记录");
      input.notify("联系人已回复", next);
    } catch (error) {
      input.notify(`联系人回复失败：${error instanceof Error ? error.message : "请求异常"}。不会自动重试。`);
    } finally {
      pending.delete(requestKey);
      if (queues.get(key) === task) queues.delete(key);
    }
  });
  pending.set(requestKey, task);
  queues.set(key, task);
  return task;
}

/** Apply discovery fields only; never overwrite newer conversations with an old snapshot. */
export function mergePhoneDiscovery(latest: CharacterPhoneRecord, before: CharacterPhoneRecord, after: CharacterPhoneRecord): CharacterPhoneRecord {
  const changed = new Map(after.actionLog.filter(action => action.discovered
    && !before.actionLog.find(old => old.id === action.id)?.discovered).map(action => [action.id, action]));
  const added = after.messages.filter(message => !before.messages.some(old => old.id === message.id)
    && !latest.messages.some(old => old.id === message.id));
  return { ...latest, actionLog: latest.actionLog.map(action => changed.get(action.id) || action),
    messages: [...latest.messages, ...added], awarenessLevel: Math.max(latest.awarenessLevel || 0, after.awarenessLevel || 0) as 0 | 1 | 2,
    awarenessUpdatedAt: Math.max(latest.awarenessUpdatedAt || 0, after.awarenessUpdatedAt || 0),
    updatedAt: Math.max(latest.updatedAt, after.updatedAt) };
}
