import type { UserSettings } from "../../../types";

export function buildTextAiRuntimeConfig(settings: UserSettings, defaultModel = "gemini-3.5-flash") {
  return {
    apiKey: settings.apiKey || "",
    model: settings.selectedModel || defaultModel,
    apiEndpoint: settings.apiEndpoint,
    apiTemperature: settings.apiTemperature,
    streamCompatible: settings.streamCompatible,
  };
}
