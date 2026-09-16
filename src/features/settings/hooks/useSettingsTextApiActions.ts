import type { Dispatch, SetStateAction } from "react";
import type { useSettingsApiPresetState } from "./useSettingsApiPresetState";
import { createId } from "../../../core/id/createId";
import { apiFetchModels } from "../../../utils/apiHelper";
import type { UserSettings } from "../../../types";
import { updateTextApiPresetDraft } from "./textApiPresetDraft";

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
    const currentPreset = currentPresets.find((item) => item.id === activeApiPresetId);
    const presetsWithDraft = currentPreset
      ? updateTextApiPresetDraft(currentPresets, activeApiPresetId, {
        name: presetName.trim() || currentPreset.name,
        apiEndpoint: apiEndpoint.trim(),
        apiKey: apiKey.trim(),
        selectedModel: selectedModel.trim(),
        apiTemperature,
        streamCompatible,
      })
      : currentPresets;
    const preset = presetsWithDraft.find((item) => item.id === presetId);
    if (!preset) return;
    if (presetsWithDraft !== currentPresets) setApiPresets(presetsWithDraft);
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
    const newId = createId("api-preset");
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
    const currentPreset = apiPresets.find((preset) => preset.id === activeApiPresetId);
    if (!currentPreset) {
      alert("保存失败：当前 API 配置不存在，请重新选择配置后重试。");
      return;
    }
    const updatedPresets = updateTextApiPresetDraft(apiPresets, activeApiPresetId, {
      name: presetName.trim() || currentPreset.name,
      apiEndpoint: apiEndpoint.trim(),
      apiKey: apiKey.trim(),
      selectedModel: selectedModel.trim(),
      apiTemperature,
      streamCompatible,
    });
    setApiPresets(updatedPresets);
    const saved = onSaveSettings((previous) => ({
      ...previous,
      apiPresets: updatedPresets,
      activeApiPresetId,
      apiKey: apiKey.trim(),
      selectedModel: selectedModel.trim(),
      apiEndpoint: apiEndpoint.trim(),
      apiTemperature,
      streamCompatible,
    }));
    if (!saved) {
      alert("API 配置尚未保存到浏览器；草稿只保留在当前页面，刷新或离开后可能丢失。请先导出系统备份，再到“设置 > 系统备份 > 本地存储诊断”检查空间；不要直接清除应用数据。");
      return;
    }
    alert("API 配置保存成功！");
  };

  return { handleSelectPreset, handleAddPreset, handleDeletePreset, handleFetchModels, handleSaveApiConfig, isFetchingModels };
}
