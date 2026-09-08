import type { Dispatch, SetStateAction } from "react";
import type { ImageApiPreset, ImageAspectRatio, UserSettings } from "../../../types";
import { apiFetchImageModels, apiTestImageConnection } from "../../../utils/apiHelper";
import { inferGeminiImageAuthMode, inferImageProtocol, supportsReferenceImageForModel } from "../../chat/services/imageProtocol";
import type { useSettingsApiPresetState } from "./useSettingsApiPresetState";

type ApiPresetState = ReturnType<typeof useSettingsApiPresetState>;

interface UseSettingsImageApiActionsOptions {
  settings: UserSettings;
  onSaveSettings: (updater: (previous: UserSettings) => UserSettings) => boolean;
  enableImageGeneration: boolean;
  setEnableImageGeneration: Dispatch<SetStateAction<boolean>>;
  apiState: ApiPresetState;
}

/** Owns image-provider preset actions while preserving the existing settings format and API behavior. */
export function useSettingsImageApiActions({
  onSaveSettings,
  enableImageGeneration,
  setEnableImageGeneration,
  apiState,
}: UseSettingsImageApiActionsOptions) {
  const {
    imageApiPresets, setImageApiPresets, activeImageApiPresetId, setActiveImageApiPresetId,
    imagePresetName, setImagePresetName, imageApiEndpoint, setImageApiEndpoint,
    imageApiKey, setImageApiKey, imageSelectedModel, setImageSelectedModel,
    imageAspectRatio, setImageAspectRatio,
    imageModelSuggestions, setImageModelSuggestions, isFetchingImageModels, setIsFetchingImageModels,
    isTestingImageApi, setIsTestingImageApi, imageTestResult, setImageTestResult,
  } = apiState;

  const selectImagePreset = (id: string, presets = imageApiPresets) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setActiveImageApiPresetId(id);
    setImagePresetName(preset.name);
    setImageApiEndpoint(preset.apiEndpoint);
    setImageApiKey(preset.apiKey);
    setImageSelectedModel(preset.selectedModel);
    setImageAspectRatio(preset.aspectRatio || "1:1");
    setImageTestResult(null);
  };

  const addImagePreset = () => {
    const preset: ImageApiPreset = {
      id: `image-preset-${Date.now()}`,
      name: `图片配置 ${imageApiPresets.length + 1}`,
      protocol: "openai-images",
      apiEndpoint: "",
      apiKey: "",
      selectedModel: "",
      aspectRatio: "1:1",
    };
    const next = [...imageApiPresets, preset];
    setImageApiPresets(next);
    selectImagePreset(preset.id, next);
  };

  const deleteImagePreset = () => {
    if (imageApiPresets.length <= 1) return alert("至少保留一个图片 API 配置。");
    const next = imageApiPresets.filter((item) => item.id !== activeImageApiPresetId);
    setImageApiPresets(next);
    selectImagePreset(next[0].id, next);
  };

  const persistImagePresetDraft = (changes: Partial<Pick<ImageApiPreset, "name" | "apiEndpoint" | "apiKey" | "selectedModel" | "aspectRatio">>) => {
    const name = changes.name ?? imagePresetName;
    const apiEndpoint = changes.apiEndpoint ?? imageApiEndpoint;
    const apiKey = changes.apiKey ?? imageApiKey;
    const selectedModel = changes.selectedModel ?? imageSelectedModel;
    const aspectRatio = changes.aspectRatio ?? imageAspectRatio;
    const protocol = inferImageProtocol(selectedModel, apiEndpoint, imageApiPresets.find((preset) => preset.id === activeImageApiPresetId)?.protocol);
    const next = imageApiPresets.map((preset) => preset.id === activeImageApiPresetId ? {
      ...preset,
      name: name.trim() || preset.name,
      apiEndpoint: apiEndpoint.trim(),
      apiKey: apiKey.trim(),
      selectedModel: selectedModel.trim(),
      aspectRatio,
      protocol,
      geminiAuthMode: protocol === "gemini-native-image" ? inferGeminiImageAuthMode(apiEndpoint) : undefined,
      referenceImageSupported: supportsReferenceImageForModel(protocol, selectedModel),
    } : preset);
    setImageApiPresets(next);
    onSaveSettings((previous) => ({ ...previous, enableImageGeneration, imageApiPresets: next, activeImageApiPresetId }));
  };

  const updateCurrentImageModel = (model: string) => {
    setImageSelectedModel(model);
    persistImagePresetDraft({ selectedModel: model });
  };

  const updateImageAspectRatio = (aspectRatio: ImageAspectRatio) => {
    setImageAspectRatio(aspectRatio);
    persistImagePresetDraft({ aspectRatio });
  };

  const imageModelListMessage = (error: unknown) => error instanceof Error && error.message
    ? error.message
    : "无法验证图片服务，请检查 API 地址、Key 和模型。";

  const fetchImageModels = async () => {
    setIsFetchingImageModels(true);
    setImageTestResult(null);
    try {
      const protocol = inferImageProtocol(imageSelectedModel, imageApiEndpoint, imageApiPresets.find((preset) => preset.id === activeImageApiPresetId)?.protocol);
      const models = await apiFetchImageModels({
        apiKey: imageApiKey.trim(),
        apiEndpoint: imageApiEndpoint.trim(),
        protocol,
        geminiAuthMode: protocol === "gemini-native-image" ? inferGeminiImageAuthMode(imageApiEndpoint) : undefined,
      });
      setImageModelSuggestions(models);
      if (!models.includes(imageSelectedModel)) updateCurrentImageModel(models[0] || "");
    } catch (error) {
      setImageTestResult({ success: false, message: imageModelListMessage(error) });
    } finally {
      setIsFetchingImageModels(false);
    }
  };

  const testImageApi = async () => {
    if (!imageSelectedModel.trim()) {
      setImageTestResult({ success: false, message: "请先选择或输入图片模型。" });
      return;
    }
    setIsTestingImageApi(true);
    try {
      const protocol = inferImageProtocol(imageSelectedModel, imageApiEndpoint, imageApiPresets.find((preset) => preset.id === activeImageApiPresetId)?.protocol);
      const result = await apiTestImageConnection({
        apiKey: imageApiKey.trim(),
        apiEndpoint: imageApiEndpoint.trim(),
        selectedModel: imageSelectedModel.trim(),
        protocol,
        geminiAuthMode: protocol === "gemini-native-image" ? inferGeminiImageAuthMode(imageApiEndpoint) : undefined,
      });
      setImageTestResult(result);
    } finally {
      setIsTestingImageApi(false);
    }
  };

  const updateImageGenerationEnabled = (enabled: boolean) => {
    setEnableImageGeneration(enabled);
    onSaveSettings((previous) => ({ ...previous, enableImageGeneration: enabled }));
  };

  const saveImageApiConfig = () => {
    if (!imageSelectedModel.trim()) {
      setImageTestResult({ success: false, message: "请先选择或输入图片模型。" });
      return;
    }
    const protocol = inferImageProtocol(imageSelectedModel, imageApiEndpoint, imageApiPresets.find((preset) => preset.id === activeImageApiPresetId)?.protocol);
    const next = imageApiPresets.map((preset) => preset.id === activeImageApiPresetId ? {
      ...preset,
      name: imagePresetName.trim() || preset.name,
      protocol,
      apiEndpoint: imageApiEndpoint.trim(),
      apiKey: imageApiKey.trim(),
      selectedModel: imageSelectedModel.trim(),
      aspectRatio: imageAspectRatio,
      geminiAuthMode: protocol === "gemini-native-image" ? inferGeminiImageAuthMode(imageApiEndpoint) : undefined,
      referenceImageSupported: supportsReferenceImageForModel(protocol, imageSelectedModel),
    } : preset);
    setImageApiPresets(next);
    onSaveSettings((previous) => ({ ...previous, enableImageGeneration, imageApiPresets: next, activeImageApiPresetId }));
    alert("图片 API 设置已保存。");
  };

  return {
    selectImagePreset, addImagePreset, deleteImagePreset, persistImagePresetDraft,
    updateCurrentImageModel, fetchImageModels, testImageApi, updateImageGenerationEnabled,
    saveImageApiConfig, imageModelSuggestions, isFetchingImageModels, isTestingImageApi, imageTestResult,
    imageApiPresets, activeImageApiPresetId, imagePresetName, imageApiEndpoint, imageApiKey, imageSelectedModel,
    imageAspectRatio, setImageApiEndpoint, setImageApiKey, setImageSelectedModel, updateImageAspectRatio,
  };
}
