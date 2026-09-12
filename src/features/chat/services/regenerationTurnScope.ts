import type { Message } from "../../../types";

export interface RegenerationTurnScope {
  messagesBeforeTarget: Message[];
  userMessage?: Message;
}

/**
 * Regeneration must address the user turn immediately before the selected
 * character reply. Keeping later turns out of the request prevents an older
 * reply from being regenerated against a newer, unrelated topic.
 */
export function resolveRegenerationTurnScope(messages: readonly Message[], targetMessage: Pick<Message, "id">): RegenerationTurnScope {
  const targetIndex = messages.findIndex((message) => message.id === targetMessage.id);
  const messagesBeforeTarget = targetIndex >= 0
    ? [...messages.slice(0, targetIndex)]
    : messages.filter((message) => message.id !== targetMessage.id);
  return {
    messagesBeforeTarget,
    userMessage: [...messagesBeforeTarget].reverse().find((message) => message.sender === "user"),
  };
}
