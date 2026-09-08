import type { useSettingsVoiceConfigState } from "./useSettingsVoiceConfigState";
import type { UserSettings } from "../../../types";
import { normalizeMosslandApiEndpoint } from "../../voice/ttsConfig";

type VoiceConfigState = ReturnType<typeof useSettingsVoiceConfigState>;

interface UseSettingsVoiceActionsOptions {
  onSaveSettings: (updater: (previous: UserSettings) => UserSettings) => boolean;
  voiceState: VoiceConfigState;
}

/** Owns TTS settings persistence while preserving legacy MiniMax and Mossland fields. */
export function useSettingsVoiceActions({ onSaveSettings, voiceState }: UseSettingsVoiceActionsOptions) {
  const {
    enableMiniMaxTts, ttsProvider, minimaxApiKey, minimaxGroupId, minimaxModel,
    minimaxSpeed, minimaxPitch, minimaxVol, minimaxProxyUrl,
    mosslandApiEndpoint, mosslandApiKey, mosslandModel,
  } = voiceState;

  const handleSaveVoiceSettings = () => {
    onSaveSettings((previous) => ({
      ...previous,
      enableMiniMaxTts,
      ttsProvider,
      minimaxApiKey: minimaxApiKey.trim(),
      minimaxGroupId: minimaxGroupId.trim(),
      minimaxModel: minimaxModel.trim(),
      minimaxSpeed: Number(minimaxSpeed),
      minimaxPitch: Number(minimaxPitch),
      minimaxVol: Number(minimaxVol),
      minimaxProxyUrl: minimaxProxyUrl.trim(),
      mosslandApiEndpoint: normalizeMosslandApiEndpoint(mosslandApiEndpoint),
      mosslandApiKey: mosslandApiKey.trim(),
      mosslandModel: mosslandModel.trim(),
    }));
    alert("语音设置保存成功！");
  };

  return { handleSaveVoiceSettings };
}
