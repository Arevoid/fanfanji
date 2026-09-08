import { Dispatch, SetStateAction } from "react";
import type { ChatIconKey } from "../../../types";

export function useChatDraftChatIcon(setDraftChatIcons: Dispatch<SetStateAction<Record<ChatIconKey, string>>>) {
  const updateDraftChatIcon = (key: ChatIconKey, value: string) => {
    setDraftChatIcons((previous) => {
      const next = { ...previous };
      const url = value.trim();
      if (url) next[key] = url;
      else delete next[key];
      return next;
    });
  };

  return { updateDraftChatIcon };
}
