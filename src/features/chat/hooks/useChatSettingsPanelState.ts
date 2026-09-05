import { useState } from "react";

export type ChatAdvancedSettingsSection = "memory" | "voiceImage" | "appearance";

export function useChatSettingsPanelState() {
  const [isShowingCardModal, setIsShowingCardModal] = useState(false);
  const [advancedSettingsSection, setAdvancedSettingsSection] = useState<ChatAdvancedSettingsSection | null>(null);
  const isShowingAdvancedSettings = advancedSettingsSection !== null;
  const advancedSettingsTitle = advancedSettingsSection === "memory"
    ? "记忆设置"
    : advancedSettingsSection === "voiceImage"
      ? "语音图片"
      : advancedSettingsSection === "appearance"
        ? "美化样式"
        : "设置";

  return {
    isShowingCardModal,
    setIsShowingCardModal,
    advancedSettingsSection,
    setAdvancedSettingsSection,
    isShowingAdvancedSettings,
    advancedSettingsTitle,
  };
}
