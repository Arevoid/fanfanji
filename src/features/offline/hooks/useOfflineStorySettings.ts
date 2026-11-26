import { useEffect, useRef, useState } from "react";
import type { OfflineStory } from "../../../types";
import { readString, writeJson } from "../../../core/storage/storageAdapter";
import { imageAssetDb } from "../../../utils/imageAssetDb";

export interface OfflineStylePreset {
  id: string;
  name: string;
  description: string;
}

export const DEFAULT_OFFLINE_STYLE_PRESETS: OfflineStylePreset[] = [
  { id: "none", name: "默认风格", description: "无附加文风限制，由大模型自行生成合适笔触。" },
  { id: "delicate", name: "细腻言情", description: "文笔细腻温柔，富有画面感，注重心理细节、细微神态描写与人物微表情，情感温和而饱满。" },
  { id: "classic_chinese", name: "古典风雅", description: "词藻典雅凝练，带有浓郁的古风或武侠韵味，常运用四字成语、古雅景物描摹以及文质彬彬的对答。" },
  { id: "light_novel", name: "轻小说动漫", description: "语言活泼欢快，多有内心独白或俏皮吐槽，画面感强烈，具有鲜明的轻小说和二次元戏剧色彩。" },
  { id: "realist", name: "硬核写实", description: "笔触洗练干脆、直白有力，绝不娇揉造作，注重尘世烟火、生活细节与真实客观的场景反应。" },
  { id: "philosophical", name: "文艺内敛", description: "富含哲学思考，语调略带沉郁或文艺，善于运用象征、留白与深沉隽永的内心活动描写。" },
];

function loadCustomPresets(): OfflineStylePreset[] {
  try {
    const raw = readString("offline_custom_style_presets").value;
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OfflineStylePreset => Boolean(
      item && typeof item === "object"
      && typeof (item as OfflineStylePreset).id === "string"
      && typeof (item as OfflineStylePreset).name === "string"
      && typeof (item as OfflineStylePreset).description === "string",
    ));
  } catch {
    return [];
  }
}

interface UseOfflineStorySettingsOptions {
  activeStory: OfflineStory | null;
  saveStory: (story: OfflineStory) => void;
  showToast: (message: string) => void;
}

export function useOfflineStorySettings({ activeStory, saveStory, showToast }: UseOfflineStorySettingsOptions) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customPresets, setCustomPresets] = useState<OfflineStylePreset[]>(loadCustomPresets);
  const [settingsWordLimit, setSettingsWordLimit] = useState("");
  const [settingsPartnerP, setSettingsPartnerP] = useState("third");
  const [settingsUserP, setSettingsUserP] = useState("first");
  const [settingsAllowCharacterToSpeakForUser, setSettingsAllowCharacterToSpeakForUser] = useState(true);
  const [settingsStylePresetId, setSettingsStylePresetId] = useState("none");
  const [settingsStylePromptName, setSettingsStylePromptName] = useState("");
  const [settingsStylePromptContent, setSettingsStylePromptContent] = useState("");
  const [settingsCustomCss, setSettingsCustomCss] = useState("");
  const [settingsBackgroundImageAssetId, setSettingsBackgroundImageAssetId] = useState<string | undefined>();
  const [settingsBackgroundImageMimeType, setSettingsBackgroundImageMimeType] = useState<string | undefined>();
  const [settingsBackgroundImagePreviewUrl, setSettingsBackgroundImagePreviewUrl] = useState<string | null>(null);
  const [pendingBackgroundImageAssetId, setPendingBackgroundImageAssetId] = useState<string | undefined>();
  const [backgroundImageCleared, setBackgroundImageCleared] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const replacePreviewUrl = (nextUrl: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = nextUrl;
    setSettingsBackgroundImagePreviewUrl(nextUrl);
  };

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    if (!activeStory) {
      setSettingsBackgroundImageAssetId(undefined);
      setSettingsBackgroundImageMimeType(undefined);
      setPendingBackgroundImageAssetId(undefined);
      setBackgroundImageCleared(false);
      replacePreviewUrl(null);
      return;
    }
    setSettingsWordLimit(activeStory.wordLimit ? String(activeStory.wordLimit) : "");
    setSettingsPartnerP(activeStory.partnerPerspective || "third");
    setSettingsUserP(activeStory.userPerspective || "first");
    setSettingsAllowCharacterToSpeakForUser(activeStory.allowCharacterToSpeakForUser !== false);
    setSettingsStylePresetId(activeStory.stylePresetId || "none");
    setSettingsStylePromptName(activeStory.stylePromptName || "");
    setSettingsStylePromptContent(activeStory.stylePromptContent || "");
    setSettingsCustomCss(activeStory.customCss || "");
    setSettingsBackgroundImageAssetId(activeStory.backgroundImageAssetId);
    setSettingsBackgroundImageMimeType(activeStory.backgroundImageMimeType);
    setPendingBackgroundImageAssetId(undefined);
    setBackgroundImageCleared(false);

    let cancelled = false;
    if (!activeStory.backgroundImageAssetId) {
      replacePreviewUrl(null);
    } else {
      void imageAssetDb.getImage(activeStory.backgroundImageAssetId).then((blob) => {
        if (cancelled) return;
        replacePreviewUrl(blob ? URL.createObjectURL(blob) : null);
      }).catch(() => {
        if (!cancelled) replacePreviewUrl(null);
      });
    }
    return () => { cancelled = true; };
  }, [activeStory?.id, activeStory?.backgroundImageAssetId, isSettingsOpen]);

  const hasSelectedCustomPreset = customPresets.some((preset) => preset.id === settingsStylePresetId);

  const handleBackgroundImageUpload = async (file: File) => {
    if (!activeStory) return;
    if (!file.type.startsWith("image/")) {
      showToast("背景图片仅支持图片文件。");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      showToast("背景图片不能超过 12MB。");
      return;
    }
    const assetId = `offline-story-background-${activeStory.id}-${Date.now()}`;
    try {
      if (pendingBackgroundImageAssetId) await imageAssetDb.deleteImage(pendingBackgroundImageAssetId);
      await imageAssetDb.saveImage(assetId, file);
      setPendingBackgroundImageAssetId(assetId);
      setSettingsBackgroundImageMimeType(file.type || "image/jpeg");
      setBackgroundImageCleared(false);
      replacePreviewUrl(URL.createObjectURL(file));
      showToast("背景图片已载入，保存设置后生效。");
    } catch {
      showToast("背景图片保存失败，请重试。");
    }
  };

  const handleClearBackgroundImage = async () => {
    if (pendingBackgroundImageAssetId) {
      await imageAssetDb.deleteImage(pendingBackgroundImageAssetId).catch(() => undefined);
      setPendingBackgroundImageAssetId(undefined);
    }
    setBackgroundImageCleared(true);
    replacePreviewUrl(null);
    showToast("已清除独立背景，保存后恢复 CSS 背景。");
  };

  const handleCancelSettings = async () => {
    if (pendingBackgroundImageAssetId) await imageAssetDb.deleteImage(pendingBackgroundImageAssetId).catch(() => undefined);
    setPendingBackgroundImageAssetId(undefined);
    setBackgroundImageCleared(false);
    setIsSettingsOpen(false);
  };

  const handleSaveSettings = async () => {
    if (!activeStory) return;
    const limit = parseInt(settingsWordLimit.trim(), 10);
    let backgroundImageAssetId = settingsBackgroundImageAssetId;
    if (backgroundImageCleared) {
      if (backgroundImageAssetId) await imageAssetDb.deleteImage(backgroundImageAssetId).catch(() => undefined);
      backgroundImageAssetId = undefined;
    } else if (pendingBackgroundImageAssetId) {
      if (backgroundImageAssetId && backgroundImageAssetId !== pendingBackgroundImageAssetId) {
        await imageAssetDb.deleteImage(backgroundImageAssetId).catch(() => undefined);
      }
      backgroundImageAssetId = pendingBackgroundImageAssetId;
    }
    saveStory({
      ...activeStory,
      wordLimit: Number.isNaN(limit) || limit <= 0 ? undefined : limit,
      partnerPerspective: settingsPartnerP,
      userPerspective: settingsUserP,
      allowCharacterToSpeakForUser: settingsAllowCharacterToSpeakForUser,
      stylePresetId: settingsStylePresetId,
      stylePromptName: settingsStylePromptName,
      stylePromptContent: settingsStylePromptContent,
      customCss: settingsCustomCss,
      backgroundImageAssetId,
      backgroundImageMimeType: backgroundImageAssetId ? settingsBackgroundImageMimeType : undefined,
      updatedAt: Date.now(),
    });
    setSettingsBackgroundImageAssetId(backgroundImageAssetId);
    setPendingBackgroundImageAssetId(undefined);
    setBackgroundImageCleared(false);
    setIsSettingsOpen(false);
    showToast("剧本配置已保存！");
  };

  const handleCreateCustomPreset = () => {
    if (!settingsStylePromptName.trim() || !settingsStylePromptContent.trim()) {
      showToast("文风名称和描述不能为空！");
      return;
    }
    const newPreset = { id: `custom_${Date.now()}`, name: settingsStylePromptName.trim(), description: settingsStylePromptContent.trim() };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    writeJson("offline_custom_style_presets", updated);
    setSettingsStylePresetId(newPreset.id);
    showToast("文风保存为预设成功！");
  };

  const handleDeleteCustomPreset = () => {
    if (!hasSelectedCustomPreset) return;
    const preset = customPresets.find((item) => item.id === settingsStylePresetId);
    if (!preset || !window.confirm(`确定删除文风预设「${preset.name}」吗？`)) return;
    const updated = customPresets.filter((item) => item.id !== preset.id);
    setCustomPresets(updated);
    writeJson("offline_custom_style_presets", updated);
    setSettingsStylePresetId("none");
    setSettingsStylePromptName("");
    setSettingsStylePromptContent("");
    showToast("文风预设已删除");
  };

  return {
    isSettingsOpen, setIsSettingsOpen, customPresets, defaultStylePresets: DEFAULT_OFFLINE_STYLE_PRESETS,
    settingsWordLimit, setSettingsWordLimit, settingsPartnerP, setSettingsPartnerP,
    settingsUserP, setSettingsUserP, settingsAllowCharacterToSpeakForUser, setSettingsAllowCharacterToSpeakForUser,
    settingsStylePresetId, setSettingsStylePresetId, settingsStylePromptName, setSettingsStylePromptName,
    settingsStylePromptContent, setSettingsStylePromptContent, settingsCustomCss, setSettingsCustomCss,
    settingsBackgroundImagePreviewUrl, handleBackgroundImageUpload, handleClearBackgroundImage,
    hasSelectedCustomPreset, handleSaveSettings, handleCancelSettings, handleCreateCustomPreset, handleDeleteCustomPreset,
  };
}
