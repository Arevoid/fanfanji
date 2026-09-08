import type { Message } from "../../types";

export interface OfflineStoryRegenerationContext {
  target: Message;
  history: Message[];
  followingMessages: Message[];
}

export function prepareOfflineStoryRegeneration(
  messages: readonly Message[],
  messageId?: string,
): OfflineStoryRegenerationContext | null {
  if (!messageId) return null;
  const index = messages.findIndex((message) => message.id === messageId && message.sender === "character");
  if (index < 0) return null;
  return {
    target: messages[index],
    history: messages.slice(0, index),
    followingMessages: messages.slice(index + 1),
  };
}

export function applyOfflineStoryRegeneration(
  context: OfflineStoryRegenerationContext,
  replacement: Message,
): Message[] {
  return [...context.history, replacement, ...context.followingMessages];
}
