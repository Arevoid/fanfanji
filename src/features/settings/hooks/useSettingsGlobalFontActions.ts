import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { UserSettings } from "../../../types";
import { fontAssetDb } from "../../../utils/fontAssetDb";
import {
  buildFontFaceSource,
  getFontFileExtension,
  getFontFormatHint,
  GLOBAL_FONT_ASSET_ID,
  sanitizeGlobalFontUrl,
} from "../../theme/globalTypography";

interface UseSettingsGlobalFontActionsOptions {
  globalFontUrlDraft: string;
  setGlobalFontUrlDraft: Dispatch<SetStateAction<string>>;
  setFontOperationPending: Dispatch<SetStateAction<boolean>>;
  setFontOperationMessage: Dispatch<SetStateAction<string>>;
  handleSave: (updatedFields: Partial<UserSettings>) => boolean;
}

export function useSettingsGlobalFontActions({
  globalFontUrlDraft,
  setGlobalFontUrlDraft,
  setFontOperationPending,
  setFontOperationMessage,
  handleSave,
}: UseSettingsGlobalFontActionsOptions) {
  const validateFontSource = async (source: string, formatHint?: string | null): Promise<void> => {
    if (typeof FontFace === "undefined") return;
    const previewFace = new FontFace("Fanfan Font Validation", buildFontFaceSource(source, formatHint));
    await previewFace.load();
  };

  const handleGlobalFontFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const extension = getFontFileExtension(file.name);
    if (!extension) {
      setFontOperationMessage("仅支持 TTF、OTF、WOFF 和 WOFF2 字体文件。");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setFontOperationMessage("字体文件不能超过 25MB。");
      return;
    }

    setFontOperationPending(true);
    setFontOperationMessage("正在校验并保存字体…");
    const objectUrl = URL.createObjectURL(file);
    try {
      await validateFontSource(objectUrl, getFontFormatHint(file.name));
      const previousFont = await fontAssetDb.getFont(GLOBAL_FONT_ASSET_ID).catch(() => null);
      await fontAssetDb.saveFont(GLOBAL_FONT_ASSET_ID, file);
      const fontName = file.name.replace(/\.[^.]+$/, "") || "自定义字体";
      const saved = handleSave({
        globalFontSource: "upload",
        globalFontName: fontName,
        globalFontAssetId: GLOBAL_FONT_ASSET_ID,
        globalFontUrl: "",
        customFontName: "",
        customFontData: "",
      });
      if (!saved) {
        if (previousFont) await fontAssetDb.saveFont(GLOBAL_FONT_ASSET_ID, previousFont);
        else await fontAssetDb.deleteFont(GLOBAL_FONT_ASSET_ID);
        setFontOperationMessage("字体设置保存失败，原字体已保留。请检查设备存储空间后重试。");
        return;
      }
      setGlobalFontUrlDraft("");
      setFontOperationMessage(`已应用字体：${fontName}`);
    } catch (error) {
      console.error("Unable to import the selected font:", error);
      setFontOperationMessage("字体文件无法读取或格式无效，请更换文件后重试。");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setFontOperationPending(false);
    }
  };

  const handleApplyGlobalFontUrl = async () => {
    const url = sanitizeGlobalFontUrl(globalFontUrlDraft);
    if (!url) {
      setFontOperationMessage("请输入有效的 HTTP 或 HTTPS 字体直链。");
      return;
    }
    setFontOperationPending(true);
    setFontOperationMessage("正在验证字体直链…");
    try {
      await validateFontSource(url, getFontFormatHint(url));
      const rawName = url.split("/").pop()?.split(/[?#]/, 1)[0] || "网络字体";
      let decodedName = rawName;
      try { decodedName = decodeURIComponent(rawName); } catch { /* Keep the safe URL segment. */ }
      const inferredName = decodedName.replace(/\.[^.]+$/, "") || "网络字体";
      const saved = handleSave({
        globalFontSource: "url",
        globalFontName: inferredName,
        globalFontUrl: url,
        globalFontAssetId: "",
        customFontName: "",
        customFontData: "",
      });
      if (!saved) {
        setFontOperationMessage("字体直链设置保存失败，请检查设备存储空间后重试。");
        return;
      }
      await fontAssetDb.deleteFont(GLOBAL_FONT_ASSET_ID).catch(() => undefined);
      setGlobalFontUrlDraft(url);
      setFontOperationMessage(`已应用字体：${inferredName}`);
    } catch (error) {
      console.error("Unable to load the font URL:", error);
      setFontOperationMessage("字体直链无法加载。请确认链接指向字体文件，并允许跨域访问。");
    } finally {
      setFontOperationPending(false);
    }
  };

  const handleResetGlobalFont = async () => {
    setFontOperationPending(true);
    try {
      const saved = handleSave({
        globalFontSource: "default",
        globalFontName: "",
        globalFontUrl: "",
        globalFontAssetId: "",
        customFontName: "",
        customFontData: "",
      });
      if (!saved) {
        setFontOperationMessage("默认字体设置保存失败，请检查设备存储空间后重试。");
        return;
      }
      await fontAssetDb.deleteFont(GLOBAL_FONT_ASSET_ID).catch(() => undefined);
      setGlobalFontUrlDraft("");
      setFontOperationMessage("已恢复系统默认字体。");
    } finally {
      setFontOperationPending(false);
    }
  };

  return { handleGlobalFontFile, handleApplyGlobalFontUrl, handleResetGlobalFont };
}
