import type { UserSettings } from "../../../types";
import { containsNonChineseText } from "../../../utils/textLanguage";
import { sanitizeCharacterActionText } from "./characterActionProtocol";

export interface DirectReplyTranslationResponse {
  text: string;
  translation?: string;
}

export type DirectReplyTranslator = (input: {
  text: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
}) => Promise<{ text: string }>;

/** Adds a best-effort translation only when the model omitted one. */
export async function ensureDirectReplyTranslation<T extends DirectReplyTranslationResponse>(
  response: T,
  input: {
    enabled: boolean;
    settings: Pick<UserSettings, "apiKey" | "selectedModel" | "apiEndpoint">;
    translate: DirectReplyTranslator;
  },
): Promise<T & DirectReplyTranslationResponse> {
  const cleanedExistingTranslation = response.translation
    ? sanitizeCharacterActionText(response.translation)
    : undefined;
  const cleanedResponse = cleanedExistingTranslation !== undefined && cleanedExistingTranslation !== response.translation
    ? cleanedExistingTranslation
      ? { ...response, translation: cleanedExistingTranslation }
      : (() => {
          const next = { ...response } as T & DirectReplyTranslationResponse;
          delete next.translation;
          return next;
        })()
    : response;

  if (!input.enabled || !cleanedResponse.text.trim() || cleanedResponse.translation?.trim() || !containsNonChineseText(cleanedResponse.text)) return cleanedResponse;
  try {
    const translated = await input.translate({
      text: sanitizeCharacterActionText(cleanedResponse.text),
      apiKey: input.settings.apiKey || "",
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
    });
    const translatedText = sanitizeCharacterActionText(translated.text);
    if (translatedText && translatedText !== cleanedResponse.text.trim()) {
      return { ...cleanedResponse, translation: translatedText };
    }
  } catch (error) {
    // Translation is an enhancement; a provider failure must not suppress the
    // already valid direct reply.
    console.warn("Automatic direct-reply translation failed:", error);
  }
  return cleanedResponse;
}
