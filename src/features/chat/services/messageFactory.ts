import type { Message } from "../../../types";
import type { CharacterMessageInput, UserMessageInput } from "./messageTypes";

export function createUserTextMessage(input: UserMessageInput): Message {
  return {
    id: input.id,
    characterId: input.characterId,
    ...(input.relationId ? { relationId: input.relationId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    sender: "user",
    content: input.content,
    timestamp: input.timestamp,
    ...(input.isOffline !== undefined ? { isOffline: input.isOffline } : {}),
    ...(input.isNarration !== undefined ? { isNarration: input.isNarration } : {}),
  };
}

export function createCharacterTextMessage(input: CharacterMessageInput): Message {
  return {
    id: input.id,
    characterId: input.characterId,
    ...(input.relationId ? { relationId: input.relationId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    sender: "character",
    ...(input.senderId ? { senderId: input.senderId } : {}),
    content: input.content,
    timestamp: input.timestamp,
    ...(input.isOffline !== undefined ? { isOffline: input.isOffline } : {}),
    ...(input.isNarration !== undefined ? { isNarration: input.isNarration } : {}),
  };
}

export const createGroupCharacterMessage = createCharacterTextMessage;
export const createSystemMessage = createCharacterTextMessage;
