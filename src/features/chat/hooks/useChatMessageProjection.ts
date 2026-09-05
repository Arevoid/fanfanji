import { useMemo } from "react";
import type { Character, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { stripInternalDeliveryMarkers } from "../services/messageParser";

interface UseChatMessageProjectionOptions {
  messages: Message[];
  activeChatCharId: string | null;
  activeRelationship?: CharacterRelationship;
  activeCharacter?: Character;
}

/** Derives the active conversation timeline without owning chat mutations. */
export function useChatMessageProjection({
  messages,
  activeChatCharId,
  activeRelationship,
  activeCharacter,
}: UseChatMessageProjectionOptions): {
  currentChatMessages: Message[];
  visibleChatMessages: Message[];
} {
  const currentChatMessages = useMemo<Message[]>(
    () => messages.filter((message) => !message.isOffline && (activeRelationship
      ? message.relationId === activeRelationship.id
      : message.characterId === activeChatCharId && activeCharacter?.isGroupChat)),
    [activeCharacter?.isGroupChat, activeChatCharId, activeRelationship?.id, messages],
  );
  const visibleChatMessages = useMemo<Message[]>(
    () => currentChatMessages
      .map((message) => ({ ...message, content: stripInternalDeliveryMarkers(message.content) }))
      .filter((message) => Boolean(message.content.trim())),
    [currentChatMessages],
  );

  return { currentChatMessages, visibleChatMessages };
}
