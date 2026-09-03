import { useEffect, useMemo } from "react";
import { prioritizeUserChatCss, scopeUserChatCss } from "../styles/chatCssScope";

export function useChatCustomCss(sources: readonly (string | undefined)[], protectedWallpaper?: string): void {
  const scopedCss = useMemo(() => {
    const combined = sources.filter((css): css is string => Boolean(css && css.trim())).join("\n");
    return combined.trim() ? prioritizeUserChatCss(scopeUserChatCss(combined)) : "";
  }, [sources]);

  useEffect(() => {
    const styleId = "app-chat-user-custom-css";
    const wallpaperStyleId = "app-chat-wallpaper-priority-css";
    const existing = document.getElementById(styleId);
    const existingWallpaperStyle = document.getElementById(wallpaperStyleId);
    if (!scopedCss) {
      if (existing instanceof HTMLStyleElement) {
        const style = existing;
        style.remove();
      }
    } else {
      const style = existing instanceof HTMLStyleElement
        ? existing
        : Object.assign(document.createElement("style"), { id: styleId });
      style.setAttribute("data-user-chat-css", "true");
      style.textContent = scopedCss;
      if (!existing) document.head.appendChild(style);
    }

    if (!protectedWallpaper?.trim()) {
      if (existingWallpaperStyle instanceof HTMLStyleElement) existingWallpaperStyle.remove();
    } else {
      const wallpaperStyle = existingWallpaperStyle instanceof HTMLStyleElement
        ? existingWallpaperStyle
        : Object.assign(document.createElement("style"), { id: wallpaperStyleId });
      const wallpaperUrl = JSON.stringify(protectedWallpaper.trim());
      wallpaperStyle.setAttribute("data-chat-wallpaper-priority", "true");
      wallpaperStyle.textContent = `
        #conv-screen[data-user-chat-css="active"] #api-chat-screen > .chat-content-scope.chat-page__background:not(.shrink-0),
        #conv-screen[data-user-chat-css="active"] #api-chat-screen > .chat-content-scope.chat-page__background .cv-messages-list {
          background-image: url(${wallpaperUrl}) !important;
          background-position: center !important;
          background-size: cover !important;
          background-repeat: no-repeat !important;
        }
      `;
      // Always move this style after the user stylesheet so the configured
      // wallpaper remains the final authority for background properties.
      document.head.appendChild(wallpaperStyle);
    }

    return () => {
      const current = document.getElementById(styleId);
      if (current instanceof HTMLStyleElement && current.textContent === scopedCss) current.remove();
      const currentWallpaper = document.getElementById(wallpaperStyleId);
      if (currentWallpaper instanceof HTMLStyleElement && !protectedWallpaper?.trim()) currentWallpaper.remove();
    };
  }, [scopedCss, protectedWallpaper]);
}
