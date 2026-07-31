import type { Message } from "../../../types";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";
import type { CharacterMessageInput, UserMessageInput } from "./messageTypes";

type ChatMessageInput = CharacterMessageInput | UserMessageInput;

function resolveCharacterId(input: ChatMessageInput): string {
  const characterId = input.characterId ?? input.context?.characterId;
  if (!characterId) throw new Error("A chat message requires a characterId or context.characterId");
  return characterId;
}

/**
 * Keep legacy fields authoritative when present. Context-only callers opt into
 * the runtime boundary without changing existing message creation behavior.
 */
function resolveBoundary(input: ChatMessageInput): Pick<ChatRuntimeContext, "relationId" | "conversationId"> {
  if (input.characterId !== undefined) {
    return { relationId: input.relationId ?? null, conversationId: input.conversationId ?? null };
  }
  return {
    relationId: input.relationId ?? input.context?.relationId ?? null,
    conversationId: input.conversationId ?? input.context?.conversationId ?? null,
  };
}

export function createUserTextMessage(input: UserMessageInput): Message {
  const boundary = resolveBoundary(input);
  return {
    id: input.id,
    characterId: resolveCharacterId(input),
    ...(boundary.relationId ? { relationId: boundary.relationId } : {}),
    ...(boundary.conversationId ? { conversationId: boundary.conversationId } : {}),
    sender: "user",
    content: input.content,
    timestamp: input.timestamp,
    ...(input.isOffline !== undefined ? { isOffline: input.isOffline } : {}),
    ...(input.isNarration !== undefined ? { isNarration: input.isNarration } : {}),
  };
}

export function createCharacterTextMessage(input: CharacterMessageInput): Message {
  const boundary = resolveBoundary(input);
  return {
    id: input.id,
    characterId: resolveCharacterId(input),
    ...(boundary.relationId ? { relationId: boundary.relationId } : {}),
    ...(boundary.conversationId ? { conversationId: boundary.conversationId } : {}),
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
