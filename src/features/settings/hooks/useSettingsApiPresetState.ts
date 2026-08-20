import { useState } from "react";
import type { ApiPreset, ImageApiPreset, UserSettings } from "../../../types";

export function useSettingsApiPresetState(settings: UserSettings) {
  const initialPresets: ApiPreset[] = settings.apiPresets || [
    {
      id: "preset-gemini",
      name: "Default Gemini",
      apiEndpoint: "",
      apiKey: "",
      selectedModel: "gemini-3.5-flash",
      apiTemperature: 0.7,
      streamCompatible: false,
    },
    {
      id: "preset-deepseek",
      name: "DeepSeek Official",
      apiEndpoint: "https://api.deepseek.com/v1",
      apiKey: "",
      selectedModel: "deepseek-v4-flash",
      apiTemperature: 0.7,
      streamCompatible: false,
    },
  ];
  const initialActiveId = settings.activeApiPresetId || "preset-gemini";
  const initialPreset = initialPresets.find((preset) => preset.id === initialActiveId) || initialPresets[0];

  const [apiPresets, setApiPresets] = useState<ApiPreset[]>(initialPresets);
  const [activeApiPresetId, setActiveApiPresetId] = useState(initialActiveId);
  const [presetName, setPresetName] = useState(initialPreset?.name || "");
  const [apiEndpoint, setApiEndpoint] = useState(initialPreset?.apiEndpoint || "");
  const [apiKey, setApiKey] = useState(initialPreset?.apiKey || "");
  const [selectedModel, setSelectedModel] = useState(initialPreset?.selectedModel || "");
  const [apiTemperature, setApiTemperature] = useState(initialPreset?.apiTemperature !== undefined ? initialPreset.apiTemperature : 0.7);
  const [streamCompatible, setStreamCompatible] = useState(initialPreset?.streamCompatible || false);
  const [showPassword, setShowPassword] = useState(false);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const defaultImagePreset: ImageApiPreset = {
    id: "image-preset-default",
    name: "图片 API 配置",
    protocol: "openai-images",
    apiEndpoint: "",
    apiKey: "",
    selectedModel: "",
  };
  const initialImagePresets = (settings.imageApiPresets?.length ? settings.imageApiPresets : [defaultImagePreset]).map((preset) => ({
    ...preset,
    selectedModel: preset.selectedModel || (preset as ImageApiPreset & { model?: string }).model || "",
  }));
  const initialImagePreset = initialImagePresets.find((preset) => preset.id === (settings.activeImageApiPresetId || initialImagePresets[0].id)) || initialImagePresets[0];

  const [enableImageGeneration, setEnableImageGeneration] = useState(settings.enableImageGeneration === true);
  const [imageApiPresets, setImageApiPresets] = useState<ImageApiPreset[]>(initialImagePresets);
  const [activeImageApiPresetId, setActiveImageApiPresetId] = useState(settings.activeImageApiPresetId || initialImagePresets[0].id);
  const [imagePresetName, setImagePresetName] = useState(initialImagePreset.name);
  const [imageApiEndpoint, setImageApiEndpoint] = useState(initialImagePreset.apiEndpoint);
  const [imageApiKey, setImageApiKey] = useState(initialImagePreset.apiKey);
  const [imageSelectedModel, setImageSelectedModel] = useState(initialImagePreset.selectedModel);
  const [showImagePassword, setShowImagePassword] = useState(false);
  const [imageModelSuggestions, setImageModelSuggestions] = useState<string[]>([]);
  const [isFetchingImageModels, setIsFetchingImageModels] = useState(false);
  const [isTestingImageApi, setIsTestingImageApi] = useState(false);
  const [imageTestResult, setImageTestResult] = useState<{ success: boolean; message: string } | null>(null);

  return {
    apiPresets, setApiPresets, activeApiPresetId, setActiveApiPresetId, presetName, setPresetName,
    apiEndpoint, setApiEndpoint, apiKey, setApiKey, selectedModel, setSelectedModel,
    apiTemperature, setApiTemperature, streamCompatible, setStreamCompatible, showPassword, setShowPassword,
    modelSuggestions, setModelSuggestions, isFetchingModels, setIsFetchingModels,
    enableImageGeneration, setEnableImageGeneration, imageApiPresets, setImageApiPresets,
    activeImageApiPresetId, setActiveImageApiPresetId, imagePresetName, setImagePresetName,
    imageApiEndpoint, setImageApiEndpoint, imageApiKey, setImageApiKey, imageSelectedModel, setImageSelectedModel,
    showImagePassword, setShowImagePassword, imageModelSuggestions, setImageModelSuggestions,
    isFetchingImageModels, setIsFetchingImageModels, isTestingImageApi, setIsTestingImageApi,
    imageTestResult, setImageTestResult,
  };
}
