import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { ChatIconOverrides, UserSettings } from "../../../types";
import { sanitizeChatIcons } from "../../../types";
import { applyDesktopModuleBackup, buildDesktopModuleBackup, parseDesktopModuleBackup } from "../../home/desktopModuleBackup";

interface UseSettingsTransferActionsOptions {
  settings: UserSettings;
  chatGlobalCSS: string;
  chatIcons: ChatIconOverrides;
  setChatGlobalCSS: Dispatch<SetStateAction<string>>;
  setChatIcons: Dispatch<SetStateAction<ChatIconOverrides>>;
  handleSave: (updatedFields: Partial<UserSettings>) => boolean;
}

/** Owns settings-only JSON transfer actions; it deliberately excludes system backup data. */
export function useSettingsTransferActions({
  settings,
  chatGlobalCSS,
  chatIcons,
  setChatGlobalCSS,
  setChatIcons,
  handleSave,
}: UseSettingsTransferActionsOptions) {
  const handleExportChatTheme = () => {
    const data = JSON.stringify({ version: 1, chatGlobalCSS, chatIcons }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "fanfanji-chat-theme.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportChatTheme = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result));
        if (!imported || typeof imported !== "object") throw new Error("invalid theme");
        const nextCss = typeof imported.chatGlobalCSS === "string" ? imported.chatGlobalCSS : "";
        const nextIcons = sanitizeChatIcons(imported.chatIcons);
        setChatGlobalCSS(nextCss);
        setChatIcons(nextIcons);
        handleSave({ chatGlobalCSS: nextCss, chatIcons: nextIcons });
        alert("聊天美化主题已导入。");
      } catch {
        alert("无法导入该主题文件，请选择有效的聊天主题 JSON。");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
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
        applyDesktopModuleBackup(backup, localStorage);
        alert("桌面模块已导入，应用将刷新以应用新外观。");
        window.location.reload();
      } catch (error: unknown) {
        alert("导入桌面模块失败：" + (error instanceof Error ? error.message : "文件格式无效"));
      }
    };
    reader.readAsText(file);
  };

  return {
    handleExportChatTheme,
    handleImportChatTheme,
    downloadDesktopModuleBackup,
    importDesktopModuleBackup,
  };
}
