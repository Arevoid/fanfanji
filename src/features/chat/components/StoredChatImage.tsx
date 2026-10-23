import { useEffect, useState } from "react";
import { imageAssetDb } from "../../../utils/imageAssetDb";
import { PreviewableImage } from "../../../components/media/ImagePreview";

export interface StoredChatImageProps {
  assetId: string;
  alt: string;
  generated?: boolean;
}

export function StoredChatImage({ assetId, alt, generated = false }: StoredChatImageProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    setUrl(null);
    imageAssetDb.getImage(assetId).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((error) => console.warn("Failed to load chat image asset:", error));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetId]);

  return url
    ? <PreviewableImage src={url} alt={alt} previewImages={[{ src: url, alt, load: () => imageAssetDb.getImage(assetId) }]} className={`chat-message--image max-w-[160px] rounded-lg object-cover cursor-zoom-in bg-stone-100 ${generated ? "shadow-none outline-none ring-0" : "shadow-sm"}`} />
    : <div className="chat-message--image-placeholder h-24 w-28 animate-pulse rounded-lg bg-slate-100" />;
}
