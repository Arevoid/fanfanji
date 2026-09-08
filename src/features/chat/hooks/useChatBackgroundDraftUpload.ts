import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { compressImage } from "../../../utils/pngParser";

interface UseChatBackgroundDraftUploadOptions {
  setDraftChatBg: Dispatch<SetStateAction<string | undefined>>;
}

export function useChatBackgroundDraftUpload({ setDraftChatBg }: UseChatBackgroundDraftUploadOptions) {
  // Set chat specific background wallpaper (draft)
  const handleDraftChatBgUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 1000, 1000, 0.7);
        setDraftChatBg(compressed);
      } catch (err) {
        console.error("Chat background compression failed:", err);
      }
    }
  };


  return { handleDraftChatBgUpload };
}
