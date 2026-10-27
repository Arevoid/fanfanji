import type { Message } from "../../types";

/** A turn may contain consecutive user inputs and any number of reply bubbles. */
export function splitCompletedChatTurns(messages: readonly Message[]): Message[][] {
  const turns: Message[][] = [];
  let pending: Message[] = [];
  let hasUser = false;
  let hasReply = false;
  for (const message of messages) {
    const conversational = !message.callId && !message.isNarration && !message.isImportedContext
      && !message.recalledAt && !message.isOffline && !(typeof message.content==="string"&&message.content.startsWith("[通话记录]|"));
    if (conversational && message.sender === "user" && hasReply) {
      turns.push(pending);
      pending = [];
      hasUser = false;
      hasReply = false;
    }
    pending.push(message);
    if (!conversational) continue;
    if (message.sender === "user") hasUser = true;
    else if (hasUser) hasReply = true;
  }
  // An unanswered input is kept for the next successful reply, never marked archived.
  if (hasReply) turns.push(pending);
  return turns;
}

export function getChatArchiveRoundLimit(rounds?: number): number {
  return Number.isFinite(rounds) ? Math.min(100, Math.max(10, Math.round(rounds!))) : 10;
}

export function splitChatArchiveTurnBatches(messages: readonly Message[], rounds: number): Message[][] {
  const turns = splitCompletedChatTurns(messages);
  const batches: Message[][] = [];
  const size = Math.max(1, Math.floor(rounds));
  for (let index = 0; index < turns.length; index += size) batches.push(turns.slice(index, index + size).flat());
  return batches;
}

/** Scheduling hint only. The extractor must still assess evidence and value. */
export function requestsPriorityMemory(message?: Message | null): boolean {
  return Boolean(message && message.sender === "user" && !message.recalledAt && !message.callId
    && /(?:请你记住|请记住|帮我记住|替我记住|别忘(?:了|记)?|不要忘(?:了|记)?|这件事.{0,8}记住|remember\s+(?:this|that)|please\s+remember)/iu.test(message.content)
    && !/(?:不要|不用|不必|别).{0,5}记住|(?:do\s*not|don't|no\s*need\s*to)\s+remember/iu.test(message.content));
}
