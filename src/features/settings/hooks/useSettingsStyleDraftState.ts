import { useEffect, useState } from "react";
import type { UserSettings } from "../../../types";
import { sanitizeGlobalFontSize } from "../../theme/globalTypography";

export function useSettingsStyleDraftState(settings: UserSettings) {
  const [wallpaper, setWallpaper] = useState(settings.wallpaper);
  const [bubbleCss, setBubbleCss] = useState(settings.bubbleCss);
  const [globalCss, setGlobalCss] = useState(settings.globalCss);
  const [chatGlobalCSS, setChatGlobalCSS] = useState(settings.chatGlobalCSS || "");
  const [globalChatCssTemplateCopied, setGlobalChatCssTemplateCopied] = useState(false);
  const [showHomeButton, setShowHomeButton] = useState(!!settings.showHomeButton);
  const [hideStatusBar, setHideStatusBar] = useState(!!settings.hideStatusBar);
  const [globalFontSize, setGlobalFontSize] = useState(() => sanitizeGlobalFontSize(settings.globalFontSize));
  const [globalFontUrlDraft, setGlobalFontUrlDraft] = useState(settings.globalFontUrl || "");
  const [fontOperationPending, setFontOperationPending] = useState(false);
  const [fontOperationMessage, setFontOperationMessage] = useState<string | null>(null);

  useEffect(() => {
    setGlobalFontSize(sanitizeGlobalFontSize(settings.globalFontSize));
    setGlobalFontUrlDraft(settings.globalFontUrl || "");
  }, [settings.globalFontSize, settings.globalFontUrl]);

  return {
    wallpaper, setWallpaper, bubbleCss, setBubbleCss, globalCss, setGlobalCss,
    chatGlobalCSS, setChatGlobalCSS, globalChatCssTemplateCopied, setGlobalChatCssTemplateCopied,
    showHomeButton, setShowHomeButton, hideStatusBar, setHideStatusBar,
    globalFontSize, setGlobalFontSize, globalFontUrlDraft, setGlobalFontUrlDraft,
    fontOperationPending, setFontOperationPending, fontOperationMessage, setFontOperationMessage,
  };
}
