import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { ChatIconOverrides, ChatThemeEntry, UserSettings } from "../../../types";
import { sanitizeChatIcons } from "../../../types";
import { buildChatThemePackage, parseChatThemePackage } from "../../chat/styles/chatThemePackage";
import {
  buildChatThemeDocx,
  downloadChatThemeBlob,
  parseChatThemeDocx,
  sanitizeChatThemeFilename,
} from "../../chat/styles/chatThemeDocuments";
import {
  applyDesktopModuleBackup,
  buildDesktopModuleBackup,
  parseDesktopModuleBackup,
  saveDesktopThemeLibrary,
  type DesktopThemeEntry,
} from "../../home/desktopModuleBackup";

export const GLOBAL_CHAT_THEME_LIBRARY_STORAGE_KEY = "phone_global_chat_theme_library";

export const loadChatThemeLibrary = (storage: Pick<Storage, "getItem">): ChatThemeEntry[] => {
  const raw = storage.getItem(GLOBAL_CHAT_THEME_LIBRARY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const source = item as Record<string, unknown>;
      if (typeof source.id !== "string" || typeof source.name !== "string" || typeof source.css !== "string") return [];
      return [{
        id: source.id,
        name: source.name.trim() || "导入主题",
        css: source.css,
        createdAt: typeof source.createdAt === "number" ? source.createdAt : 0,
        icons: sanitizeChatIcons(source.icons),
      } satisfies ChatThemeEntry];
    });
  } catch {
    return [];
  }
};

export const saveChatThemeLibrary = (entries: ChatThemeEntry[], storage: Pick<Storage, "setItem">) => {
  storage.setItem(GLOBAL_CHAT_THEME_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
};

interface UseSettingsTransferActionsOptions {
  settings: UserSettings;
  chatGlobalCSS: string;
  chatIcons: ChatIconOverrides;
  setChatGlobalCSS: Dispatch<SetStateAction<string>>;
  setChatIcons: Dispatch<SetStateAction<ChatIconOverrides>>;
  chatThemes: ChatThemeEntry[];
  setChatThemes: Dispatch<SetStateAction<ChatThemeEntry[]>>;
  desktopThemes: DesktopThemeEntry[];
  setDesktopThemes: Dispatch<SetStateAction<DesktopThemeEntry[]>>;
  handleSave: (updatedFields: Partial<UserSettings>) => boolean;
}

/** Owns settings-only JSON transfer actions; it deliberately excludes system backup data. */
export function useSettingsTransferActions({
  settings,
  chatGlobalCSS,
  chatIcons,
  setChatGlobalCSS,
  setChatIcons,
  chatThemes,
  setChatThemes,
  desktopThemes,
  setDesktopThemes,
  handleSave,
}: UseSettingsTransferActionsOptions) {
  const handleExportChatTheme = async () => {
    if (!chatGlobalCSS.trim()) {
      alert("当前没有可导出的 CSS 主题。");
      return;
    }
    try {
      const filename = `${sanitizeChatThemeFilename("饭饭机聊天主题")}.docx`;
      downloadChatThemeBlob(await buildChatThemeDocx(chatGlobalCSS), filename);
    } catch (error: unknown) {
      alert("导出聊天主题失败：" + (error instanceof Error ? error.message : "未知错误"));
    }
  };

  const handleImportChatTheme = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const extension = file.name.toLowerCase().split(".").pop() || "";
      let nextCss = "";
      let nextIcons = chatIcons;
      let importedName = file.name.replace(/\.[^.]+$/, "").trim();
      if (extension === "docx") {
        nextCss = await parseChatThemeDocx(await file.arrayBuffer());
      } else if (extension === "json") {
        const imported = JSON.parse(await file.text());
        const parsed = parseChatThemePackage(imported);
        nextCss = parsed.css;
        nextIcons = sanitizeChatIcons(parsed.icons);
        importedName = parsed.name?.trim() || importedName;
      } else {
        nextCss = await file.text();
      }
      nextCss = nextCss.replace(/^\uFEFF/, "");
      if (!nextCss.trim()) throw new Error("主题文件中没有 CSS 内容");
      const now = Date.now();
      const entry: ChatThemeEntry = {
        id: `global-chat-theme-${now}`,
        name: importedName || "导入主题",
        css: nextCss,
        icons: nextIcons,
        createdAt: now,
      };
      const nextThemes = [...chatThemes, entry];
      saveChatThemeLibrary(nextThemes, localStorage);
      setChatThemes(nextThemes);
      setChatGlobalCSS(nextCss);
      setChatIcons(nextIcons);
      // Imported v1/v2 files are normalized onto the single compatible CSS
      // pipeline; the version is intentionally no longer user-selectable.
      handleSave({ chatGlobalCSS: nextCss, chatIcons: nextIcons, chatCssApiVersion: 2, chatThemes: nextThemes });
      alert("聊天美化主题已导入。");
    } catch (error: unknown) {
      alert(error instanceof Error ? `无法导入该主题文件：${error.message}` : "无法导入该主题文件，请检查格式。");
    } finally {
      event.target.value = "";
    }
  };

  const applyChatTheme = (theme: ChatThemeEntry) => {
    const nextIcons = sanitizeChatIcons(theme.icons);
    setChatGlobalCSS(theme.css);
    setChatIcons(nextIcons);
    handleSave({ chatGlobalCSS: theme.css, chatIcons: nextIcons, chatCssApiVersion: 2 });
  };

  const deleteChatTheme = (id: string) => {
    const nextThemes = chatThemes.filter((theme) => theme.id !== id);
    saveChatThemeLibrary(nextThemes, localStorage);
    setChatThemes(nextThemes);
    handleSave({ chatThemes: nextThemes });
  };

  const downloadDesktopModuleBackup = () => {
    try {
      const backup = buildDesktopModuleBackup(settings, localStorage);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      link.href = url;
      link.download = `fanfanji-desktop-module_${date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      alert("导出桌面模块失败：" + (error instanceof Error ? error.message : "未知错误"));
    }
  };

  const importDesktopModuleBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = parseDesktopModuleBackup(JSON.parse(reader.result as string));
        if (!confirm("导入桌面模块将覆盖当前壁纸、Dock、桌面布局、小组件与应用图标美化设置；聊天、角色、API 等数据不会受影响。是否继续？")) return;
        const now = Date.now();
        const importedName = file.name.replace(/\.[^.]+$/, "").trim() || "导入桌面主题";
        const entry: DesktopThemeEntry = { id: `desktop-theme-${now}`, name: importedName, createdAt: now, backup };
        const nextThemes = [...desktopThemes, entry];
        saveDesktopThemeLibrary(nextThemes, localStorage);
        setDesktopThemes(nextThemes);
        applyDesktopModuleBackup(backup, localStorage);
        alert("桌面模块已导入，应用将刷新以应用新外观。");
        window.location.reload();
      } catch (error: unknown) {
        alert("导入桌面模块失败：" + (error instanceof Error ? error.message : "文件格式无效"));
      }
    };
    reader.readAsText(file);
  };

  const applyDesktopTheme = (theme: DesktopThemeEntry) => {
    applyDesktopModuleBackup(theme.backup, localStorage);
    window.location.reload();
  };

  const deleteDesktopTheme = (id: string) => {
    const nextThemes = desktopThemes.filter((theme) => theme.id !== id);
    saveDesktopThemeLibrary(nextThemes, localStorage);
    setDesktopThemes(nextThemes);
  };

  return {
    handleExportChatTheme,
    handleImportChatTheme,
    applyChatTheme,
    deleteChatTheme,
    downloadDesktopModuleBackup,
    importDesktopModuleBackup,
    applyDesktopTheme,
    deleteDesktopTheme,
  };
}
