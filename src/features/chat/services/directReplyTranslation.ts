import type { UserSettings } from "../../../types";
import { containsNonChineseText } from "../../../utils/textLanguage";

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
  if (!input.enabled || !response.text.trim() || response.translation?.trim() || !containsNonChineseText(response.text)) return response;
  try {
    const translated = await input.translate({
      text: response.text,
      apiKey: input.settings.apiKey || "",
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
    });
    if (translated.text.trim() && translated.text.trim() !== response.text.trim()) {
      return { ...response, translation: translated.text };
    }
  } catch (error) {
    // Translation is an enhancement; a provider failure must not suppress the
    // already valid direct reply.
    console.warn("Automatic direct-reply translation failed:", error);
  }
  return response;
}
