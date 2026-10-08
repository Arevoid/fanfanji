import { getCallTranscriptText } from "./messageParser";
import { getVideoCallDisplayText, parseVideoCallResponse } from "./videoCallProtocol";
import { normalizeVoiceTranslation } from "./voiceMessageContent";

export interface CallTranslationParts {
  speech?: string;
  scene?: string;
}

/**
 * Normalizes model translation output into the two parts a call UI can show.
 * Voice calls only have speech. Video calls may return the same [画面]/[台词]
 * protocol as the original response, but plain translated text is accepted as
 * a speech translation for compatibility with older model responses.
 */
export function getCallTranslationParts(
  originalContent: string,
  translatedContent: string | undefined,
  mode: "voice" | "video" = "voice",
): CallTranslationParts {
  const translated = translatedContent?.trim();
  if (!translated) return {};

  if (mode === "video") {
    const parsed = parseVideoCallResponse(translated);
    const speech = parsed.speech.trim();
    const scene = parsed.scene?.trim();
    if (speech || scene) return {
      ...(speech ? { speech } : {}),
      ...(scene ? { scene } : {}),
    };
  }

  const sourceIsVoice = originalContent.trim().startsWith("[语音");
  const speech = sourceIsVoice
    ? normalizeVoiceTranslation(translated)
    : getVideoCallDisplayText(translated).replace(/^画面：/u, "").trim();
  return speech ? { speech } : {};
}
