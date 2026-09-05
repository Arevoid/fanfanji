import type { CharacterPhoneGalleryItem } from "../../domain/characterPhone/types";

/**
 * Renders a text-only gallery image for the character phone.
 *
 * The album intentionally keeps the original description in `caption` and
 * stores this local SVG as `dataUrl`. No image API or remote asset is needed,
 * so a generated gallery trace remains deterministic and privacy-safe.
 */
export function createCharacterPhoneTextImageDataUrl(description: string, title: string): string {
  const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  })[character] || character);
  const compactDescription = description.trim().replace(/\s+/g, " ").slice(0, 160);
  const safeTitle = escapeXml(title.trim().slice(0, 28) || "生活片段");
  const safeDescription = escapeXml(compactDescription || "一张值得留下的照片");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#f3eee8"/><circle cx="890" cy="180" r="260" fill="#e7d9d0" opacity=".7"/><circle cx="150" cy="1180" r="280" fill="#dce8e8" opacity=".8"/><text x="84" y="160" fill="#82756d" font-family="Arial, sans-serif" font-size="34" letter-spacing="7">PHOTO NOTE</text><text x="84" y="320" fill="#252a2d" font-family="Arial, sans-serif" font-size="68" font-weight="700">${safeTitle}</text><foreignObject x="84" y="410" width="900" height="520"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;font-size:42px;line-height:1.6;color:#4b5558;">${safeDescription}</div></foreignObject><line x1="84" y1="1030" x2="996" y2="1030" stroke="#b9aaa0" stroke-width="2"/><text x="84" y="1110" fill="#82756d" font-family="Arial, sans-serif" font-size="28">角色手机 · 文字图</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Text images are persisted as their short title/caption plus a marker. The
 * SVG data URL is derived only when the gallery needs to render it, keeping
 * large encoded strings out of localStorage.
 */
export function getCharacterPhoneGalleryImageDataUrl(item: CharacterPhoneGalleryItem): string | undefined {
  if (item.dataUrl) return item.dataUrl;
  if (!item.textImageForId) return undefined;
  return createCharacterPhoneTextImageDataUrl(item.caption, item.title);
}
