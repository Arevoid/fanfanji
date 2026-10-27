import type { Message } from "../../../types";
import { stripInternalDeliveryMarkers } from "./messageParser";
import { sanitizeCharacterActionText } from "./characterActionProtocol";
const visibility = new WeakMap<Message, { text: string; visible: boolean }>();
const display = new WeakMap<Message, { text: string; translation?: string; value: Message }>();
export function isVisibleChatMessage(message: Message): boolean {
  const cached = visibility.get(message); if (cached?.text === message.content) return cached.visible;
  const visible = Boolean(stripInternalDeliveryMarkers(message.content).trim());
  visibility.set(message, { text: message.content, visible }); return visible;
}
export function projectChatDisplayMessage(message: Message): Message {
  const cached = display.get(message);
  if (cached?.text === message.content && cached.translation === message.translation) return cached.value;
  const stripped = stripInternalDeliveryMarkers(message.content);
  const value = { ...message, content: message.sender === "character" ? sanitizeCharacterActionText(stripped) : stripped,
    ...(message.translation ? { translation: sanitizeCharacterActionText(message.translation) } : {}) };
  display.set(message, { text: message.content, translation: message.translation, value }); return value;
}
