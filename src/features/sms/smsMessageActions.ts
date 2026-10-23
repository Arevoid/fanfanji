import type { SmsMessage, SmsStore, SmsTimeline } from "../../domain/sms/smsTypes";
import { buildSmsMemoryNote } from "./smsPrompt";

export function smsTimelineMessages(store: SmsStore, scope: SmsTimeline): SmsMessage[] {
  return store.messages.filter(m => m.timelineId === scope.id && m.characterId === scope.characterId && m.ownerIdentityId === scope.ownerIdentityId && m.phoneNumber === scope.phoneNumber).sort((a, b) => a.receivedAt - b.receivedAt);
}
/** Legacy replies have no batch ID: a contiguous character turn is one reply. */
export function smsReplyTarget(store: SmsStore, scope: SmsTimeline, id: string) {
  const messages = smsTimelineMessages(store, scope), position = messages.findIndex(m => m.id === id);
  if (position < 0 || messages[position].sender !== "character") return undefined;
  let start = position, end = position + 1;
  const batch = messages[position].replyBatchId;
  const same = (m: SmsMessage) => m.sender === "character" && (batch ? m.replyBatchId === batch : !m.replyBatchId);
  while (start > 0 && same(messages[start - 1])) start--;
  while (end < messages.length && same(messages[end])) end++;
  const prefix = messages.slice(0, start), user = prefix.at(-1);
  if (user?.sender !== "user") return undefined;
  return { messages: messages.slice(start, end), prefix: prefix.slice(0, -1), user };
}
/** Rebuild derived notes so removed/replaced content cannot linger in SMS context. */
export function replaceSmsMessages(store: SmsStore, scope: SmsTimeline, ids: readonly string[], replacements: readonly SmsMessage[]): SmsStore {
  const scopedIds = new Set(smsTimelineMessages(store, scope).filter(m => ids.includes(m.id)).map(m => m.id));
  if (scopedIds.size !== ids.length) return store;
  if (replacements.some(m => m.timelineId !== scope.id || m.characterId !== scope.characterId || m.ownerIdentityId !== scope.ownerIdentityId || m.phoneNumber !== scope.phoneNumber)) return store;
  const messages = store.messages.filter(m => !scopedIds.has(m.id)).concat(replacements);
  const scoped = smsTimelineMessages({ ...store, messages }, scope);
  const notes = scoped.map(m => buildSmsMemoryNote(m.sender, m.content)).filter((note): note is string => Boolean(note)).slice(-20);
  const memories = store.memories.filter(m => !(m.timelineId === scope.id && m.characterId === scope.characterId && m.ownerIdentityId === scope.ownerIdentityId && m.phoneNumber === scope.phoneNumber));
  if (notes.length) memories.push({ timelineId: scope.id, characterId: scope.characterId, ownerIdentityId: scope.ownerIdentityId, phoneNumber: scope.phoneNumber, notes, updatedAt: Date.now() });
  return { ...store, messages, memories, timelines: store.timelines.map(t => t.id === scope.id && t.characterId === scope.characterId && t.ownerIdentityId === scope.ownerIdentityId && t.phoneNumber === scope.phoneNumber ? { ...t, updatedAt: scoped.at(-1)?.receivedAt ?? t.createdAt } : t) };
}
