import type { Dispatch, SetStateAction } from "react";
import type { useSettingsApiPresetState } from "./useSettingsApiPresetState";
import { apiFetchModels } from "../../../utils/apiHelper";
import type { UserSettings } from "../../../types";

type ApiPresetState = ReturnType<typeof useSettingsApiPresetState>;

interface UseSettingsTextApiActionsOptions {
  settings: UserSettings;
  onSaveSettings: (updater: (previous: UserSettings) => UserSettings) => boolean;
  apiState: ApiPresetState;
  setTestResult: Dispatch<SetStateAction<{ success: boolean; message: string } | null>>;
}

/** Owns text-model preset actions without changing endpoint, key, or backup behavior. */
export function useSettingsTextApiActions({ settings, onSaveSettings, apiState, setTestResult }: UseSettingsTextApiActionsOptions) {
  const {
    apiPresets, setApiPresets, activeApiPresetId, setActiveApiPresetId,
    presetName, setPresetName, apiEndpoint, setApiEndpoint, apiKey, setApiKey,
    selectedModel, setSelectedModel, apiTemperature, setApiTemperature,
    streamCompatible, setStreamCompatible, setModelSuggestions,
    isFetchingModels, setIsFetchingModels,
  } = apiState;

  const handleSelectPreset = (presetId: string, currentPresets = apiPresets) => {
    const preset = currentPresets.find((item) => item.id === presetId);
    if (!preset) return;
    setActiveApiPresetId(presetId);
    setPresetName(preset.name);
    setApiEndpoint(preset.apiEndpoint);
    setApiKey(preset.apiKey);
    setSelectedModel(preset.selectedModel);
    setApiTemperature(preset.apiTemperature);
    setStreamCompatible(preset.streamCompatible);
    setTestResult(null);
  };

  const handleAddPreset = () => {
    const newId = `preset-${Date.now()}`;
    const newPreset = {
      id: newId,
      name: `新建配置 ${apiPresets.length + 1}`,
      apiEndpoint: "",
      apiKey: "",
      selectedModel: "gemini-3.5-flash",
      apiTemperature: 0.7,
      streamCompatible: false,
    };
    const updated = [...apiPresets, newPreset];
    setApiPresets(updated);
    handleSelectPreset(newId, updated);
  };

  const handleDeletePreset = (idToDelete: string) => {
    if (apiPresets.length <= 1) {
      alert("最少需要保留一个 API 配置！");
      return;
    }
    const updated = apiPresets.filter((preset) => preset.id !== idToDelete);
    setApiPresets(updated);
    handleSelectPreset(updated[0].id, updated);
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    try {
      const models = await apiFetchModels({ apiKey: apiKey.trim() || settings.apiKey, apiEndpoint: apiEndpoint.trim() });
      if (models && models.length > 0) {
        setModelSuggestions(models);
        if (!models.includes(selectedModel)) setSelectedModel(models[0]);
      }
    } catch (error) {
      console.error("Fetch models error:", error);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSaveApiConfig = () => {
    const updatedPresets = apiPresets.map((preset) => preset.id === activeApiPresetId ? {
      id: preset.id,
      name: presetName.trim() || preset.name,
      apiEndpoint: apiEndpoint.trim(),
      apiKey: apiKey.trim(),
      selectedModel: selectedModel.trim(),
      apiTemperature,
      streamCompatible,
    } : preset);
    setApiPresets(updatedPresets);
    onSaveSettings((previous) => ({
      ...previous,
      apiPresets: updatedPresets,
      activeApiPresetId,
      apiKey: apiKey.trim(),
      selectedModel: selectedModel.trim(),
      apiEndpoint: apiEndpoint.trim(),
      apiTemperature,
      streamCompatible,
    }));
    alert("API 配置保存成功！");
  };

  return { handleSelectPreset, handleAddPreset, handleDeletePreset, handleFetchModels, handleSaveApiConfig, isFetchingModels };
}
