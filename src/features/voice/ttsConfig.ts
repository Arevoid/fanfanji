import type { Character, UserSettings } from "../../types";
import type { TtsOptions } from "../../utils/minimaxTts";

export type TtsProvider = "minimax" | "mossland";

export function getTtsProvider(settings: Pick<UserSettings, "ttsProvider">): TtsProvider {
  return settings.ttsProvider === "mossland" ? "mossland" : "minimax";
}

export function buildCharacterTtsOptions(
  settings: UserSettings,
  character?: Pick<Character, "minimaxVoiceId" | "mosslandVoiceId" | "minimaxSpeed">,
  provider: TtsProvider = getTtsProvider(settings),
): TtsOptions {
  if (provider === "mossland") {
    return {
      provider,
      apiEndpoint: settings.mosslandApiEndpoint || "https://api.mosi.cn/v1/audio/speech",
      apiKey: settings.mosslandApiKey || undefined,
      model: settings.mosslandModel || "moss-tts",
      voiceId: character?.mosslandVoiceId || undefined,
    };
  }

  return {
    provider,
    apiKey: settings.minimaxApiKey || undefined,
    groupId: settings.minimaxGroupId || undefined,
    model: settings.minimaxModel || "speech-2.8-hd",
    speed: character?.minimaxSpeed ?? settings.minimaxSpeed ?? 1,
    pitch: settings.minimaxPitch ?? 0,
    vol: settings.minimaxVol ?? 1,
    voiceId: character?.minimaxVoiceId || "female-shaonv",
    proxyUrl: settings.minimaxProxyUrl || undefined,
  };
}
