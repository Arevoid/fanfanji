import { useEffect, useMemo } from "react";
import { prioritizeUserChatCss, scopeUserChatCss } from "../styles/chatCssScope";

export function useChatCustomCss(sources: readonly (string | undefined)[]): void {
  const scopedCss = useMemo(() => {
    const combined = sources.filter((css): css is string => Boolean(css && css.trim())).join("\n");
    return combined.trim() ? prioritizeUserChatCss(scopeUserChatCss(combined)) : "";
  }, [sources]);

  useEffect(() => {
    const styleId = "app-chat-user-custom-css";
    const existing = document.getElementById(styleId);
    if (!scopedCss) {
      existing?.remove();
      return;
    }
    const style = existing instanceof HTMLStyleElement
      ? existing
      : Object.assign(document.createElement("style"), { id: styleId });
    style.setAttribute("data-user-chat-css", "true");
    style.textContent = scopedCss;
    if (!existing) document.head.appendChild(style);
    return () => {
      if (style.textContent === scopedCss) style.remove();
    };
  }, [scopedCss]);
}
