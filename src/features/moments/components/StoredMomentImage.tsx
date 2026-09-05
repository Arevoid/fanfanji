import { useEffect, useState } from "react";
import { imageAssetDb } from "../../../utils/imageAssetDb";

interface StoredMomentImageProps {
  assetId: string;
  alt: string;
  width?: number;
  height?: number;
}

/** Loads a persisted Moment image from IndexedDB without putting binary data in metadata. */
export function StoredMomentImage({ assetId, alt, width, height }: StoredMomentImageProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    imageAssetDb.getImage(assetId).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((error) => console.warn("Failed to load Moment image asset:", error));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  if (!url) {
    return <div className="h-32 w-40 animate-pulse rounded-lg bg-slate-100" aria-label="正在加载朋友圈图片" />;
  }

  return <img src={url} alt={alt} width={width} height={height} className="block h-auto w-auto max-w-[200px] max-h-52 object-contain rounded-lg" />;
}
