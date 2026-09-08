import { useEffect } from "react";
import type { UserSettings } from "../../types";
import { fontAssetDb } from "../../utils/fontAssetDb";
import {
  buildFontFaceSource,
  GLOBAL_FONT_FACE_NAME,
  resolveGlobalFontSource,
  sanitizeGlobalFontSize,
  sanitizeGlobalFontUrl,
} from "./globalTypography";

const STYLE_ELEMENT_ID = "fanfan-global-font-face";

function setFontFaceStyle(sourceUrl: string): void {
  let style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    document.head.appendChild(style);
  }
  style.textContent = `@font-face { font-family: ${JSON.stringify(GLOBAL_FONT_FACE_NAME)}; src: ${buildFontFaceSource(sourceUrl)}; font-style: normal; font-weight: 100 900; font-display: swap; }`;
}

function clearFontFaceStyle(): void {
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}

export function useGlobalTypography(settings: UserSettings): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const source = resolveGlobalFontSource(settings);
    let cancelled = false;
    let objectUrl: string | null = null;

    const fontSize = sanitizeGlobalFontSize(settings.globalFontSize);
    root.style.setProperty("--app-root-font-size", `${fontSize}px`);
    root.style.setProperty("--app-font-scale", String(fontSize / 16));
    root.style.setProperty("--app-font-family", source === "default"
      ? "var(--app-default-font-family)"
      : `${JSON.stringify(GLOBAL_FONT_FACE_NAME)}, var(--app-default-font-family)`);

    const apply = async () => {
      clearFontFaceStyle();
      if (source === "url") {
        const url = sanitizeGlobalFontUrl(settings.globalFontUrl);
        if (url && !cancelled) setFontFaceStyle(url);
        return;
      }
      if (source === "upload" && settings.globalFontAssetId) {
        try {
          const blob = await fontAssetDb.getFont(settings.globalFontAssetId);
          if (!blob || cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setFontFaceStyle(objectUrl);
        } catch (error) {
          console.warn("[typography] Failed to load the uploaded global font.", error);
        }
      }
    };
    void apply();

    return () => {
      cancelled = true;
      clearFontFaceStyle();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [settings.globalFontAssetId, settings.globalFontSize, settings.globalFontSource, settings.globalFontUrl]);
}
