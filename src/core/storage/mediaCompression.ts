import { imageAssetDb } from "../../utils/imageAssetDb";
import { stickerDb } from "../../utils/stickerDb";

export interface MediaCompressionResult {
  kind: "images" | "stickers" | "all";
  processed: number;
  compressed: number;
  bytesBefore: number;
  bytesAfter: number;
  failed: number;
}

const DEFAULT_WEBP_QUALITY = 0.86;

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isSupportedSource(blob: Blob): boolean {
  const type = blob.type.toLowerCase();
  // Rasterising animated GIFs or SVGs would alter their semantics. They are
  // intentionally left untouched; their formal records remain available.
  return type.startsWith("image/")
    && type !== "image/gif"
    && type !== "image/svg+xml"
    && type !== "image/svg";
}

function readImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof Image === "undefined" || typeof URL === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    image.src = objectUrl;
  });
}

/**
 * Re-encodes a raster image at its original dimensions. If the browser cannot
 * decode it, cannot encode WebP, or the result is not smaller, the original
 * Blob is returned unchanged.
 */
export async function compressImageBlob(blob: Blob, quality = DEFAULT_WEBP_QUALITY): Promise<Blob> {
  if (!isBlob(blob) || !isSupportedSource(blob) || typeof document === "undefined") return blob;
  const dimensions = await readImageDimensions(blob);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return blob;
  const image = new Image();
  const objectUrl = URL.createObjectURL(blob);
  const compressed = await new Promise<Blob | null>((resolve) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
      canvas.toBlob((result) => {
        URL.revokeObjectURL(objectUrl);
        resolve(result);
      }, "image/webp", quality);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    image.src = objectUrl;
  });
  if (!compressed || compressed.size >= blob.size) return blob;
  // Keep the original MIME type for callers that use it as a display hint;
  // the bytes remain a valid image and all metadata records are untouched.
  return compressed;
}

async function compressImageEntries(
  entries: Array<{ id: string; blob: Blob }>,
  save: (id: string, blob: Blob) => Promise<void>,
): Promise<Omit<MediaCompressionResult, "kind">> {
  let processed = 0;
  let compressed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  let failed = 0;
  for (const entry of entries) {
    processed += 1;
    bytesBefore += entry.blob.size;
    try {
      const next = await compressImageBlob(entry.blob);
      if (next !== entry.blob && next.size < entry.blob.size) {
        await save(entry.id, next);
        compressed += 1;
        bytesAfter += next.size;
      } else {
        bytesAfter += entry.blob.size;
      }
    } catch {
      failed += 1;
      bytesAfter += entry.blob.size;
    }
  }
  return { processed, compressed, bytesBefore, bytesAfter, failed };
}

export async function compressImageAssets(ids?: readonly string[]): Promise<MediaCompressionResult> {
  if (ids && ids.length === 0) return { kind: "images", processed: 0, compressed: 0, bytesBefore: 0, bytesAfter: 0, failed: 0 };
  try {
    const entries = await imageAssetDb.listImages(ids);
    return { kind: "images", ...(await compressImageEntries(entries, (id, blob) => imageAssetDb.saveImage(id, blob))) };
  } catch {
    return { kind: "images", processed: 0, compressed: 0, bytesBefore: 0, bytesAfter: 0, failed: 1 };
  }
}

export async function compressStickerAssets(ids?: readonly string[]): Promise<MediaCompressionResult> {
  try {
    const entries = await stickerDb.listStickerImages(ids);
    return { kind: "stickers", ...(await compressImageEntries(entries, (id, blob) => stickerDb.saveStickerImage(id, blob))) };
  } catch {
    return { kind: "stickers", processed: 0, compressed: 0, bytesBefore: 0, bytesAfter: 0, failed: 1 };
  }
}

export async function compressMediaAssets(options: {
  imageIds?: readonly string[];
  stickerIds?: readonly string[];
} = {}): Promise<MediaCompressionResult> {
  const [images, stickers] = await Promise.all([
    compressImageAssets(options.imageIds),
    compressStickerAssets(options.stickerIds),
  ]);
  return {
    kind: "all",
    processed: images.processed + stickers.processed,
    compressed: images.compressed + stickers.compressed,
    bytesBefore: images.bytesBefore + stickers.bytesBefore,
    bytesAfter: images.bytesAfter + stickers.bytesAfter,
    failed: images.failed + stickers.failed,
  };
}

export function formatMediaCompressionResult(result: MediaCompressionResult): string {
  const released = Math.max(0, result.bytesBefore - result.bytesAfter);
  if (result.failed > 0 && result.processed === 0) return "压缩服务暂不可用，正式数据未被改动。";
  if (result.compressed === 0) return `已检查 ${result.processed} 项媒体，未发现可进一步压缩的文件。`;
  return `已压缩 ${result.compressed} 项媒体，释放约 ${formatBytes(released)}${result.failed ? `，${result.failed} 项失败` : ""}。正式记录未被删除。`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
