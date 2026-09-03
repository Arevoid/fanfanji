import { useState } from "react";
import { readString } from "../../../core/storage/storageAdapter";
import { storageKeys } from "../../../core/storage/storageKeys";

export function useSettingsBackupUiState() {
  const [showBackupExportOptions, setShowBackupExportOptions] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState(() => readString(storageKeys.lastBackupAt).value);
  const [isClearingApplicationData, setIsClearingApplicationData] = useState(false);

  return {
    showBackupExportOptions, setShowBackupExportOptions, lastBackupAt, setLastBackupAt,
    isClearingApplicationData, setIsClearingApplicationData,
  };
}
