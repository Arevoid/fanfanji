import type { Character, UserSettings } from "../../types";
import type { TtsOptions } from "../../utils/minimaxTts";
import { resolveCanonicalCharacterId } from "../../domain/character/characterIdentity";

export type TtsProvider = "minimax" | "mossland";
export const MOSSLAND_DEFAULT_SPEECH_ENDPOINT = "https://api.mosi.cn/v1/audio/speech";

export function normalizeMosslandApiEndpoint(value?: string): string {
  const endpoint = value?.trim() || MOSSLAND_DEFAULT_SPEECH_ENDPOINT;
  try {
    const url = new URL(endpoint);
    const isMarketingHome = ["mossland.mosi.cn", "mossland.studio", "studio.mosi.cn"].includes(url.hostname)
      && (url.pathname === "/" || url.pathname === "");
    return isMarketingHome ? MOSSLAND_DEFAULT_SPEECH_ENDPOINT : endpoint;
  } catch {
    return endpoint;
  }
}

export function getTtsProvider(settings: Pick<UserSettings, "ttsProvider">): TtsProvider {
  return settings.ttsProvider === "mossland" ? "mossland" : "minimax";
}

export function canPlayTtsMessage(input: {
  isOfflineModeActive: boolean;
  isVoiceMessage: boolean;
  isQueuedCallSpeech: boolean;
}): boolean {
  return input.isOfflineModeActive || input.isVoiceMessage || input.isQueuedCallSpeech;
}

/** Only non-empty character subtitles are eligible for call TTS; the global switch is applied by the caller. */
export function shouldQueueCallSpeech(sender: "user" | "character", subtitle: string): boolean {
  return sender === "character" && Boolean(subtitle.trim());
}

export function resolveTtsCharacter(
  characters: readonly Character[],
  characterId?: string,
  senderId?: string,
): Character | undefined {
  const rawId = characterId || senderId || "";
  const canonicalId = resolveCanonicalCharacterId(rawId, characters);
  return characters.find((character) => character.id === canonicalId && !character.isContactInstance)
    || characters.find((character) => character.id === rawId);
}

export function buildCharacterTtsOptions(
  settings: UserSettings,
  character?: Pick<Character, "minimaxVoiceId" | "mosslandVoiceId" | "minimaxSpeed">,
  provider: TtsProvider = getTtsProvider(settings),
): TtsOptions {
  if (provider === "mossland") {
    return {
      provider,
      apiEndpoint: normalizeMosslandApiEndpoint(settings.mosslandApiEndpoint),
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
