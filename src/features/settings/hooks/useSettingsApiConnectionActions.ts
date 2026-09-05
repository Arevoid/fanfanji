import type { Dispatch, SetStateAction } from "react";
import type { UserSettings } from "../../../types";
import { apiTestKey } from "../../../utils/apiHelper";

interface UseSettingsApiConnectionActionsOptions {
  settings: UserSettings;
  apiKey: string;
  apiEndpoint: string;
  selectedModel: string;
  setIsTesting: Dispatch<SetStateAction<boolean>>;
  setTestResult: Dispatch<SetStateAction<{ success: boolean; msg: string } | null>>;
}

/** Owns the text API connectivity check without changing endpoint or authentication behavior. */
export function useSettingsApiConnectionActions({
  settings, apiKey, apiEndpoint, selectedModel, setIsTesting, setTestResult,
}: UseSettingsApiConnectionActionsOptions) {
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await apiTestKey({
        apiKey: apiKey.trim() || settings.apiKey,
        model: selectedModel,
        apiEndpoint: apiEndpoint.trim(),
      });
      setTestResult({ success: result.success, msg: result.message });
    } catch (error) {
      setTestResult({ success: false, msg: error instanceof Error ? error.message : "连接失败" });
    } finally {
      setIsTesting(false);
    }
  };

  return { handleTestConnection };
}
