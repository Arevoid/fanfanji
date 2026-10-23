import { useEffect, useState } from "react";
import { imageAssetDb } from "../../../utils/imageAssetDb";
import { PreviewableImage } from "../../../components/media/ImagePreview";
import type { PreviewImageSource } from "../../../utils/imageSave";

interface StoredCharacterPhoneImageProps {
  assetId: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  previewImages?: readonly PreviewImageSource[];
  previewIndex?: number;
}

/** Loads a gallery image from IndexedDB without putting binary data in phone metadata. */
export function StoredCharacterPhoneImage({
  assetId,
  alt,
  className = "h-full w-full object-cover",
  placeholderClassName = "h-full w-full bg-neutral-200",
  previewImages, previewIndex,
}: StoredCharacterPhoneImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setObjectUrl(null);
    void imageAssetDb.getImage(assetId).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setObjectUrl(url);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetId]);

  return objectUrl
    ? previewImages ? <PreviewableImage src={objectUrl} alt={alt} className={className} previewImages={previewImages} previewIndex={previewIndex} /> : <img src={objectUrl} alt={alt} className={className} />
    : <span className={placeholderClassName} aria-label={`${alt}加载中`} />;
}
