import { useState } from "react";
import type { ChatIconOverrides, UserSettings } from "../../../types";
import { sanitizeChatIcons } from "../../../types";

export function useSettingsChatIconState(settings: UserSettings) {
  const [chatIcons, setChatIcons] = useState<ChatIconOverrides>(() => sanitizeChatIcons(settings.chatIcons));
  return { chatIcons, setChatIcons };
}
