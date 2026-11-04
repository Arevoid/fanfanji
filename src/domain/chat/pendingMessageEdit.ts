import type { Message } from "../../types";
export function isPlainPendingText(message: Message): boolean {
  return message.sender === "user" && !message.isOffline && !message.isImportedContext && !message.recalledAt && !message.callId && !message.audioUrl && !message.imageAssetId && Boolean(message.content.trim()) && !/^(?:\[|data:|https?:\/\/.*\.(?:png|jpe?g|gif|webp)(?:\?|$))/i.test(message.content.trim());
}
const sameScope=(a:Message,b:Message)=>a.characterId===b.characterId && a.relationId===b.relationId && a.conversationId===b.conversationId;
export function canEditPendingMessage(target: Message, messages: readonly Message[]): boolean {
  const index=messages.findIndex(message=>message.id===target.id && sameScope(message,target));
  if(index<0) return false;
  const current=messages[index];
  return current.pendingReplyEditable === true && isPlainPendingText(current) && !messages.slice(index+1).some(message=>sameScope(message,current) && message.sender==="character");
}
