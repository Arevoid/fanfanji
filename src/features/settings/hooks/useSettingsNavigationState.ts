import { useState } from "react";
import type { SettingsTab } from "../settingsNavigation";

export function useSettingsNavigationState() {
  const [activeTab, setActiveTab] = useState<SettingsTab>(null);
  return { activeTab, setActiveTab };
}
