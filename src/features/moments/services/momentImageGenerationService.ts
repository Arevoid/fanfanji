import type { Character, Moment, UserSettings } from "../../../types";
import { buildMomentImagePrompt } from "../../../domain/prompt/characterImagePrompt";
import { requestCharacterImageData } from "../../chat/services/characterImageService";

/** Generates the real photo for a character's text-image Moment without creating a chat message. */
export async function generateMomentImage(input: {
  settings: UserSettings;
  character: Character;
  moment: Pick<Moment, "content" | "imageDescription">;
  signal?: AbortSignal;
}): Promise<{ image: string; mimeType: string }> {
  const imageDescription = input.moment.imageDescription?.trim();
  if (!imageDescription) throw new Error("这条文字图没有可用的图片描述。");

  const generated = await requestCharacterImageData({
    settings: input.settings,
    character: input.character,
    trigger: "manual",
    userText: imageDescription,
    prompt: buildMomentImagePrompt({
      character: input.character,
      postContent: input.moment.content,
      imageDescription,
    }),
    signal: input.signal,
  });
  return {
    image: generated.dataUrl,
    mimeType: generated.imageBlob.type || "image/png",
  };
}
