import type { UserSettings } from "../../types";

export const DEFAULT_GLOBAL_FONT_SIZE = 16;
export const MIN_GLOBAL_FONT_SIZE = 13;
export const MAX_GLOBAL_FONT_SIZE = 20;
export const GLOBAL_FONT_ASSET_ID = "global-custom-font";
export const GLOBAL_FONT_FACE_NAME = "Fanfan Global Custom";

export type GlobalFontSource = "default" | "upload" | "url";

export function sanitizeGlobalFontSize(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_GLOBAL_FONT_SIZE;
  return Math.min(MAX_GLOBAL_FONT_SIZE, Math.max(MIN_GLOBAL_FONT_SIZE, Math.round(numeric)));
}

export function sanitizeGlobalFontUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function resolveGlobalFontSource(settings: Pick<UserSettings, "globalFontSource" | "globalFontUrl" | "globalFontAssetId">): GlobalFontSource {
  if (settings.globalFontSource === "upload" && settings.globalFontAssetId) return "upload";
  if (settings.globalFontSource === "url" && sanitizeGlobalFontUrl(settings.globalFontUrl)) return "url";
  return "default";
}

export function getFontFileExtension(fileName: string): "ttf" | "otf" | "woff" | "woff2" | null {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase();
  return extension === "ttf" || extension === "otf" || extension === "woff" || extension === "woff2"
    ? extension
    : null;
}

export function getFontFormatHint(source: string): string | null {
  const extension = getFontFileExtension(source.split(/[?#]/, 1)[0]);
  if (extension === "ttf") return "truetype";
  if (extension === "otf") return "opentype";
  return extension;
}

export function buildFontFaceSource(url: string, formatHint = getFontFormatHint(url)): string {
  return `url(${JSON.stringify(url)})${formatHint ? ` format(${JSON.stringify(formatHint)})` : ""}`;
}
