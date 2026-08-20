import { useEffect } from "react";
import type { Character, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";

interface UseChatGreetingOptions {
  activeChatCharId?: string;
  activeCharacter?: Character;
  activeRelationship?: CharacterRelationship;
  messages: Message[];
  sentGreetings: string[];
  isOfflineStoryActiveFor: (scopeKey: string) => boolean;
  onSendMessage: (message: Message) => void;
  setSentGreetings: (update: (previous: string[]) => string[]) => void;
  setIsTyping: (value: boolean) => void;
}

/** Sends a character's configured opening line once per chat scope. */
export function useChatGreeting({
  activeChatCharId,
  activeCharacter,
  activeRelationship,
  messages,
  sentGreetings,
  isOfflineStoryActiveFor,
  onSendMessage,
  setSentGreetings,
  setIsTyping,
}: UseChatGreetingOptions): void {
  useEffect(() => {
    if (!activeChatCharId || !activeCharacter || (!activeCharacter.isGroupChat && !activeRelationship)) return;
    const chatKey = activeRelationship?.id || activeChatCharId;
    if (isOfflineStoryActiveFor(chatKey)) return;
    const currentChatMessages = messages.filter((message) =>
      !message.isOffline
      && (activeCharacter.isGroupChat ? message.characterId === activeChatCharId : message.relationId === activeRelationship?.id));
    if (currentChatMessages.length > 0 || !activeCharacter.greeting?.trim() || sentGreetings.includes(chatKey)) return;

    setSentGreetings((previous) => [...previous, chatKey]);
    setIsTyping(true);
    const timer = setTimeout(() => {
      onSendMessage({
        id: `msg-greeting-${Date.now()}`,
        characterId: activeChatCharId,
        relationId: activeRelationship?.id,
        conversationId: activeRelationship?.conversationId,
        sender: "character",
        content: activeCharacter.greeting!.trim(),
        timestamp: Date.now(),
      });
      setIsTyping(false);
    }, 1500);
    return () => {
      clearTimeout(timer);
      setIsTyping(false);
    };
  }, [activeChatCharId, activeRelationship, activeCharacter, messages, onSendMessage, sentGreetings, isOfflineStoryActiveFor, setSentGreetings, setIsTyping]);
}
