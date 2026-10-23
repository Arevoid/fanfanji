export interface PreviewImageSource { src?: string; alt?: string; load?: () => Promise<Blob | null> }
export function isPreviewImageUrl(src: string): boolean {
  try { const url = new URL(src, "https://local.invalid"); return ["http:", "https:", "blob:"].includes(url.protocol) || (url.protocol === "data:" && /^data:image\//i.test(src)); } catch { return false; }
}
const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif", "image/bmp": "bmp", "image/svg+xml": "svg", "image/x-icon": "ico" };
export async function prepareImageFile(source: PreviewImageSource, signal?: AbortSignal): Promise<File> {
  let blob: Blob | null;
  if (source.load) blob = await source.load();
  else {
    if (!source.src || !isPreviewImageUrl(source.src)) throw Error("图片地址不可用。");
    let response: Response;
    try { response = await fetch(source.src, { signal, referrerPolicy: "no-referrer" }); }
    catch (error) { if (signal?.aborted) throw error; throw Error("无法读取原图，可能受跨域或网络限制，请重试或打开原图保存。"); }
    if (!response.ok) throw Error("无法读取原图，请重试或打开原图保存。");
    blob = await response.blob();
  }
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!blob?.size) throw Error("没有找到原图文件。");
  let mime = blob.type.toLowerCase().split(";")[0];
  if (!mime || mime === "application/octet-stream") {
    const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) mime = "image/png";
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = "image/jpeg";
    else if (String.fromCharCode(...bytes.slice(0, 3)) === "GIF") mime = "image/gif";
    else if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") mime = "image/webp";
  }
  if (!extensions[mime]) throw Error("图片格式无法保存，请尝试打开原图。");
  return new File([blob], `米饭机图片-${Date.now()}.${extensions[mime]}`, { type: mime });
}
export interface ImageSavePort { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void>; download: (file: File) => void }
export async function saveImageFile(file: File, port: ImageSavePort): Promise<"shared" | "downloaded" | "cancelled"> {
  const data = { files: [file] };
  try {
    if (port.share && port.canShare?.(data)) { await port.share(data); return "shared"; }
  } catch (error) { if (error instanceof Error && error.name === "AbortError") return "cancelled"; }
  port.download(file); return "downloaded";
}
export function downloadImageFile(file: File): void {
  const url = URL.createObjectURL(file), anchor = document.createElement("a");
  anchor.href = url; anchor.download = file.name; document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}
