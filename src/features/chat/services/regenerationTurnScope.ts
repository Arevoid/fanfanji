import type { Message } from "../../../types";

export interface RegenerationTurnScope {
  messagesBeforeTarget: Message[];
  userMessage?: Message;
  targetMessages: Message[];
}

/**
 * Regeneration must address the user turn immediately before the selected
 * character reply. Keeping later turns out of the request prevents an older
 * reply from being regenerated against a newer, unrelated topic.
 */
export function resolveRegenerationTurnScope(messages: readonly Message[], targetMessage: Pick<Message, "id">): RegenerationTurnScope {
  const targetIndex = messages.findIndex((message) => message.id === targetMessage.id);
  if (targetIndex < 0) {
    return {
      messagesBeforeTarget: messages.filter((message) => message.id !== targetMessage.id),
      userMessage: [...messages].reverse().find((message) => message.sender === "user"),
      targetMessages: [targetMessage as Message],
    };
  }

  const targetBatchId = messages[targetIndex]?.replyBatchId;
  let batchStart = targetIndex;
  let batchEnd = targetIndex + 1;
  if (targetBatchId) {
    const batchIndexes = messages
      .map((message, index) => message.replyBatchId === targetBatchId ? index : -1)
      .filter((index) => index >= 0);
    if (batchIndexes.length > 0) {
      batchStart = Math.min(...batchIndexes);
      batchEnd = Math.max(...batchIndexes) + 1;
    }
  } else {
    // Legacy messages have no batch id. Character bubbles are delivered
    // consecutively for one API response, so recover that turn boundary from
    // the contiguous character run around the selected bubble.
    while (batchStart > 0 && messages[batchStart - 1]?.sender === "character") batchStart -= 1;
    while (batchEnd < messages.length && messages[batchEnd]?.sender === "character") batchEnd += 1;
  }

  const targetMessages = messages
    .slice(batchStart, batchEnd)
    .filter((message) => message.sender === "character");
  const messagesBeforeTarget = [...messages.slice(0, batchStart)];
  return {
    messagesBeforeTarget,
    userMessage: [...messagesBeforeTarget].reverse().find((message) => message.sender === "user"),
    targetMessages: targetMessages.length > 0 ? targetMessages : [messages[targetIndex]],
  };
}
