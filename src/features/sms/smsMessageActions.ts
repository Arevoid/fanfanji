import type { SmsMessage, SmsStore, SmsTimeline } from "../../domain/sms/smsTypes";
import { buildSmsMemoryNote } from "./smsPrompt";

export function isInSmsTimeline(message: SmsMessage, timeline: Pick<SmsTimeline, "id" | "characterId" | "ownerIdentityId" | "phoneNumber">): boolean {
  return message.timelineId === timeline.id && message.characterId === timeline.characterId && message.ownerIdentityId === timeline.ownerIdentityId && message.phoneNumber === timeline.phoneNumber;
}

export function latestSmsReply(messages: readonly SmsMessage[], target: SmsMessage): { user: SmsMessage; replies: SmsMessage[] } | null {
  const scoped = messages.filter(message => isInSmsTimeline(message, { ...target, id: target.timelineId })).sort((a,b) => a.receivedAt-b.receivedAt);
  let userIndex = scoped.length - 1;
  while (userIndex >= 0 && scoped[userIndex].sender !== "user") userIndex--;
  const replies = scoped.slice(userIndex + 1);
  return userIndex >= 0 && replies.length > 0 && replies.every(message => message.sender === "character") && replies.some(message => message.id === target.id) ? { user: scoped[userIndex], replies } : null;
}

/** Remove source-dependent SMS memory alongside its messages, without touching other scopes. */
export function removeSmsMessages(store: SmsStore, timeline: SmsTimeline, ids: readonly string[]): SmsStore {
  const removed = new Set(store.messages.filter(message => isInSmsTimeline(message,timeline) && ids.includes(message.id)).map(message => message.id));
  const messages = store.messages.filter(message => !isInSmsTimeline(message,timeline) || !removed.has(message.id));
  return { ...store, messages, memories: store.memories.map(memory => {
    if (memory.timelineId !== timeline.id || memory.characterId !== timeline.characterId || memory.ownerIdentityId !== timeline.ownerIdentityId || memory.phoneNumber !== timeline.phoneNumber) return memory;
    return { ...memory, notes: messages.filter(message => isInSmsTimeline(message,timeline)).map(message => buildSmsMemoryNote(message.sender,message.content)).filter((note): note is string => !!note).slice(-20), relationshipSummary: undefined,
      claims: memory.claims?.filter(claim => !claim.source.messageIds.some(id => removed.has(id))),
      processedRevisions: Object.fromEntries(Object.entries(memory.processedRevisions || {}).filter(([id]) => !removed.has(id))) };
  }) };
}
