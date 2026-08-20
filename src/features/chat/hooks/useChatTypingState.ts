import { useState } from "react";
import type { Character } from "../../../types";
import {
  getVisibleChatTyping,
  setChatScopeCharacterOverride,
  setChatScopeTyping,
  type ChatTypingScopeState,
} from "../services/chatTypingScope";

/** Keeps asynchronous reply typing indicators isolated by chat scope. */
export function useChatTypingState(activeScopeKey: string) {
  const [typingByScope, setTypingByScope] = useState<ChatTypingScopeState<Character>>({});

  const setIsTyping = (isTyping: boolean) => {
    setTypingByScope((previous) => setChatScopeTyping(previous, activeScopeKey, isTyping));
  };

  const setTypingCharacterOverride = (character: Character | null) => {
    setTypingByScope((previous) => setChatScopeCharacterOverride(previous, activeScopeKey, character));
  };

  const visibleTypingState = getVisibleChatTyping<Character>(typingByScope, activeScopeKey);
  return {
    setIsTyping,
    setTypingCharacterOverride,
    isTyping: Boolean(visibleTypingState),
    typingCharacterOverride: visibleTypingState?.characterOverride || null,
  };
}
