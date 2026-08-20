import { useState } from "react";
import type { OfflineReadingPreferences } from "../../../components/offline/OfflineReadingSettings";

/** Owns reader preferences and transient controls for the offline manuscript. */
export function useOfflineReadingState() {
  const [isReadingSettingsOpen, setIsReadingSettingsOpen] = useState(false);
  const [readingPreferences, setReadingPreferences] = useState<OfflineReadingPreferences>({
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 1.5,
    paragraphSpacing: 18,
    textColor: "#1D1D1F",
    cardBackground: "#FFFFFF",
  });
  const [activeNodeMenuId, setActiveNodeMenuId] = useState<string | null>(null);
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<string | null>(null);
  const [isGuidancePanelOpen, setIsGuidancePanelOpen] = useState(false);
  const [guidanceDraft, setGuidanceDraft] = useState({ oneTime: "", ongoing: "" });

  return {
    isReadingSettingsOpen,
    setIsReadingSettingsOpen,
    readingPreferences,
    setReadingPreferences,
    activeNodeMenuId,
    setActiveNodeMenuId,
    pendingDeleteMessageId,
    setPendingDeleteMessageId,
    isGuidancePanelOpen,
    setIsGuidancePanelOpen,
    guidanceDraft,
    setGuidanceDraft,
  };
}
