import type { Dispatch, SetStateAction } from "react";

interface UseOfflineRegenerationActionsOptions {
  setActiveNodeMenuId: Dispatch<SetStateAction<string | null>>;
  handleSendMessage: (textToSend?: string, forceAIOnly?: boolean, options?: { regenerateMessageId?: string }) => void | Promise<void>;
}

/** Owns the offline message regeneration entry point without changing generation semantics. */
export function useOfflineRegenerationActions({ setActiveNodeMenuId, handleSendMessage }: UseOfflineRegenerationActionsOptions) {
  const handleRegenerateMessage = (messageId: string) => {
    setActiveNodeMenuId(null);
    void handleSendMessage(undefined, true, { regenerateMessageId: messageId });
  };

  return { handleRegenerateMessage };
}
