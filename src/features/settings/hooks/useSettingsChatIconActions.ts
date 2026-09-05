import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { ChatIconKey, ChatIconOverrides, UserSettings } from "../../../types";

interface UseSettingsChatIconActionsOptions {
  chatIcons: ChatIconOverrides;
  setChatIcons: Dispatch<SetStateAction<ChatIconOverrides>>;
  handleSave: (updatedFields: Partial<UserSettings>) => boolean;
}

/** Updates one chat icon and persists the complete override set immediately. */
export function useSettingsChatIconActions({ chatIcons, setChatIcons, handleSave }: UseSettingsChatIconActionsOptions) {
  const updateChatIcon = useCallback((key: ChatIconKey, value: string) => {
    const next = { ...chatIcons };
    const url = value.trim();
    if (url) next[key] = url;
    else delete next[key];
    setChatIcons(next);
    handleSave({ chatIcons: next });
  }, [chatIcons, handleSave, setChatIcons]);

  return { updateChatIcon };
}
