import { useState } from "react";

export function useSettingsTransientUiState() {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [newPresetName, setNewPresetName] = useState("");

  return { isTesting, setIsTesting, testResult, setTestResult, newPresetName, setNewPresetName };
}
