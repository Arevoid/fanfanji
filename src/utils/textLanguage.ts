/**
 * Returns true when text contains a writing system that should be translated
 * to the app's default Chinese display language.  This is intentionally a
 * script check rather than a language-name check: characters may write in
 * Cyrillic, Arabic, Greek, Thai, etc. without their nationality being present
 * in the message or persona.
 */
export function containsNonChineseText(text: string): boolean {
  if (!text.trim()) return false;

  // CJK ideographs are the app's target language and do not by themselves
  // make a message translatable.  Other scripts are explicit evidence that
  // translation may be needed, even when a sentence also contains Chinese.
  return /[A-Za-z]{2,}|[\u3040-\u30ff]|[\uac00-\ud7af]|[\u0400-\u052f]|[\u0370-\u03ff]|[\u0590-\u05ff]|[\u0600-\u06ff]|[\u0750-\u077f]|[\u0900-\u097f]|[\u0e00-\u0e7f]|[\u1000-\u109f]|[\u1200-\u137f]|[\u1780-\u17ff]|[\u1800-\u18af]|[\u3040-\u30ff]/u.test(text)
    && !/^[\s\p{P}\p{S}\p{N}]+$/u.test(text);
}
