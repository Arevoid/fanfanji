import type { Dispatch, SetStateAction } from "react";
import { clearApplicationData } from "../clearApplicationData";

interface UseSettingsClearDataActionsOptions {
  isClearingApplicationData: boolean;
  setIsClearingApplicationData: Dispatch<SetStateAction<boolean>>;
}

/** Owns the explicit destructive data-clear flow and preserves its confirmation/reload behavior. */
export function useSettingsClearDataActions({ isClearingApplicationData, setIsClearingApplicationData }: UseSettingsClearDataActionsOptions) {
  const handleClearApplicationData = async () => {
    if (isClearingApplicationData) return;
    if (!confirm("⚠️ 确定要清除所有缓存并恢复为默认设置吗？这会清空全部对话和角色数据且无法恢复！")) return;
    setIsClearingApplicationData(true);
    try {
      await clearApplicationData();
      window.location.reload();
    } catch (error) {
      console.error("Failed to clear application data:", error);
      setIsClearingApplicationData(false);
      alert("清除失败，数据未被完整重置，请稍后重试。");
    }
  };

  return { handleClearApplicationData };
}
