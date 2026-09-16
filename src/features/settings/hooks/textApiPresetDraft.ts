import type { ApiPreset } from "../../../types";

export type TextApiPresetDraft = Pick<
  ApiPreset,
  "name" | "apiEndpoint" | "apiKey" | "selectedModel" | "apiTemperature" | "streamCompatible"
>;

/** Copies the visible form draft back into its preset before the UI switches presets. */
export function updateTextApiPresetDraft(
  presets: ApiPreset[],
  presetId: string,
  draft: TextApiPresetDraft,
): ApiPreset[] {
  if (!presets.some((preset) => preset.id === presetId)) return presets;
  return presets.map((preset) => preset.id === presetId ? { ...preset, ...draft } : preset);
}
