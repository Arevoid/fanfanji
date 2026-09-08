/**
 * The image-memory marker is emitted only in the private character reply.
 * It is deliberately not a normal chat action: the UI strips it before the
 * reply is persisted, while the character can still make a contextual choice.
 */
export const CHARACTER_SAVE_USER_IMAGE_DIRECTIVE = "[[SAVE_USER_IMAGE]]";

const CHARACTER_SAVE_USER_IMAGE_PATTERN = /\[\[\s*SAVE_USER_IMAGE\s*\]\]|\[\s*SAVE_USER_IMAGE\s*\]/giu;

export function parseCharacterSaveUserImageDirective(text: string): {
  shouldSave: boolean;
  visibleText: string;
} {
  const shouldSave = CHARACTER_SAVE_USER_IMAGE_PATTERN.test(text);
  CHARACTER_SAVE_USER_IMAGE_PATTERN.lastIndex = 0;
  return {
    shouldSave,
    visibleText: text.replace(CHARACTER_SAVE_USER_IMAGE_PATTERN, "").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

export async function imageDataUrlToBlob(value: string): Promise<Blob> {
  const response = await fetch(value);
  if (!response.ok) throw new Error(`无法读取用户发送的图片（HTTP ${response.status}）。`);
  return response.blob();
}
