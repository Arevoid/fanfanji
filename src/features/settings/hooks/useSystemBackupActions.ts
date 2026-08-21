import type { ChangeEvent } from "react";
import type { OfflineStory } from "../../../types";
import { notifyForumStateChanged } from "../../../core/storage/repositories/forumRepository";
import { notifyAppearanceSettingsChanged } from "../../theme/appearanceRepository";
import { offlineStoryDb } from "../../../core/storage/offlineStoryDb";
import { mergeOfflineStoryCollections } from "../../../core/storage/repositories/offlineRepository";
import { buildSystemBackup, checksumPayload, filterSystemBackupLocalStorageForRestore, inspectSystemBackup, parseSystemBackup, restoreSystemBackupIndexedDb, snapshotSystemBackupIndexedDb, splitSystemBackupJson } from "../systemBackup";
import { readString, remove as removeStoredValue, writeString } from "../../../core/storage/storageAdapter";
import { storageKeys } from "../../../core/storage/storageKeys";

interface UseSystemBackupActionsOptions {
  backupKeys: ReadonlySet<string>;
  fullBackupKeys: readonly string[];
  lightBackupKeys: readonly string[];
  sanitizeValue: (key: string, value: string | null, source?: Record<string, unknown>) => string | null;
  onBackupCompleted?: (timestamp: number) => void;
}

function snapshotLocalStorage(): Map<string, string> {
  const snapshot = new Map<string, string>();
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null) {
      const value = readString(key).value;
      if (value !== null) snapshot.set(key, value);
    }
  }
  return snapshot;
}

function downloadOriginalBackupFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  const safeName = (file.name || "backup.json").replace(/[^a-zA-Z0-9._-]/g, "_");
  link.href = url;
  link.download = `fanfanji_original_${safeName}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function assertBackupStorageCapacity(entries: readonly [string, string | null][]): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate();
  if (!estimate.quota || estimate.usage === undefined) return;
  const additionalBytes = entries
    .filter(([, value]) => typeof value === "string")
    .reduce((total, [key, value]) => total + Math.max(0, (value?.length || 0) - (readString(key).value?.length || 0)) * 2, 0);
  if (estimate.usage + additionalBytes > estimate.quota * 0.95) {
    throw new Error("浏览器本地存储空间不足，请先清理存储数据后再导入。线下故事会单独保存，不占用本地配置空间。");
  }
}

export function useSystemBackupActions({ backupKeys, fullBackupKeys, lightBackupKeys, sanitizeValue, onBackupCompleted }: UseSystemBackupActionsOptions) {
  const downloadBackup = async (keys: readonly string[]): Promise<void> => {
    const backup = await buildSystemBackup(localStorage, keys);
    const backupData = {
      ...backup,
      localStorage: Object.fromEntries(Object.entries(backup.localStorage).map(([key, value]) => [
        key,
        sanitizeValue(key, value),
      ])),
    };
    if (keys.includes("phone_offline_stories")) {
      try {
        const localStories = JSON.parse(backupData.localStorage.phone_offline_stories || "[]") as OfflineStory[];
        const durableStories = await offlineStoryDb.loadAll();
        backupData.localStorage.phone_offline_stories = JSON.stringify(mergeOfflineStoryCollections(
          Array.isArray(localStories) ? localStories : [],
          durableStories,
        ));
      } catch (error) {
        console.warn("Unable to include the durable offline-story copy in this backup.", error);
      }
    }
    // Sanitization can change the exported localStorage payload. Re-sign the
    // final bytes so an exported backup can pass checksum verification when it
    // is imported again.
    const signedBackupData = { ...backupData, checksum: checksumPayload(backupData) };
    const blob = new Blob(splitSystemBackupJson(JSON.stringify(signedBackupData, null, 2)), { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    link.href = url;
    link.download = `xiaoshouji_backup_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    const timestamp = Date.now();
    writeString(storageKeys.lastBackupAt, String(timestamp));
    onBackupCompleted?.(timestamp);
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportFull = () => downloadBackup(fullBackupKeys);
  const handleExportLight = () => downloadBackup(lightBackupKeys);

  const handleSystemBackupImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsedBackup = parseSystemBackup(JSON.parse(reader.result as string));
        const entries = Object.entries(parsedBackup.localStorage);
        if (entries.length === 0 || entries.some(([key, value]) => !backupKeys.has(key) || (value !== null && typeof value !== "string"))) {
          throw new Error("非有效的小手机备份文件！");
        }
        if (!confirm("确定要导入此备份吗？这将会覆盖当前所有对话、人设、设置 and 世界书数据且不可撤销！")) return;
        const entriesToWrite = filterSystemBackupLocalStorageForRestore(entries, parsedBackup.indexedDb);
        await assertBackupStorageCapacity(entriesToWrite);
        const snapshot = snapshotLocalStorage();
        const indexedDbSnapshot = await snapshotSystemBackupIndexedDb();
        const writtenKeys: string[] = [];
        const previousOfflineStories = await offlineStoryDb.loadAll();
        let indexedDbRestoreReport = { restoredKeys: [] as string[], skippedKeys: [] as string[] };
        const hasOfflineEntryBackup = Array.isArray(parsedBackup.indexedDb["offline-story-entry-v1"]);
        const restoredOfflineStories = hasOfflineEntryBackup ? undefined : entries.find(([key]) => key === "phone_offline_stories")?.[1];
        try {
          for (const [key, value] of entriesToWrite) {
            if (typeof value !== "string") continue;
            writtenKeys.push(key);
            const restoredValue = sanitizeValue(key, value, parsedBackup.localStorage) || value;
            const writeResult = writeString(key, restoredValue);
            if (!writeResult.success) throw new Error(`恢复 ${key} 失败：${writeResult.error || "write"}`);
          }
          indexedDbRestoreReport = await restoreSystemBackupIndexedDb(parsedBackup.indexedDb);
          if (typeof restoredOfflineStories === "string") {
            const parsedStories = JSON.parse(restoredOfflineStories) as unknown;
            if (!Array.isArray(parsedStories)) throw new Error("线下故事备份格式无效");
            await offlineStoryDb.replaceAll(parsedStories as OfflineStory[]);
          }
        } catch (writeError) {
          for (const key of writtenKeys) {
            const previousValue = snapshot.get(key);
            try {
              if (previousValue === undefined) removeStoredValue(key);
              else writeString(key, previousValue);
            } catch (rollbackError) {
              console.error("Backup restore rollback failed:", rollbackError);
            }
          }
          try {
            await offlineStoryDb.replaceAll(previousOfflineStories);
          } catch (offlineRollbackError) {
            console.error("Backup restore offline-story rollback failed:", offlineRollbackError);
          }
          try {
            await restoreSystemBackupIndexedDb(indexedDbSnapshot);
          } catch (indexedDbRollbackError) {
            console.error("Backup restore IndexedDB rollback failed:", indexedDbRollbackError);
          }
          throw writeError;
        }
        if (entries.some(([key]) => key.startsWith("phone_forum_"))) notifyForumStateChanged();
        if (entries.some(([key]) => key === "phone_appearance_settings")) notifyAppearanceSettingsChanged();
        if (entries.length === 1 && entries[0][0] === "phone_appearance_settings") {
          alert("外观设置已恢复并立即应用。");
          return;
        }
        const restoredModuleCount = indexedDbRestoreReport.restoredKeys.length + (typeof restoredOfflineStories === "string" ? 1 : 0);
        const skippedModuleText = indexedDbRestoreReport.skippedKeys.length > 0 ? `，跳过 ${indexedDbRestoreReport.skippedKeys.length} 个未知 IndexedDB 模块` : "";
        alert(`导入成功！已恢复 ${writtenKeys.length + restoredModuleCount} 个模块${skippedModuleText}。应用即将刷新加载新数据。`);
        window.location.reload();
      } catch (error: any) {
        alert("导入备份失败: " + error.message);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleSystemBackupInspect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const report = inspectSystemBackup(JSON.parse(reader.result as string));
        const modules = report.modules.map((module) => `${module.key}: ${module.kind}${module.recordCount === undefined ? "" : ` (${module.recordCount} 条)`}`).join("；") || "无 IndexedDB 模块";
        const message = report.valid
          ? `只读检查通过：${report.legacy ? "旧版" : `v${report.version ?? "?"}`} 备份，${report.localStorageKeyCount} 个本地数据项。${modules}`
          : `只读检查未通过：${report.error || "备份包含无法识别的数据模块"}`;
        alert(message);
        if (confirm("只读恢复模式不会修改当前数据。是否另存这份原始备份，以便后续恢复或交给维护者分析？")) {
          downloadOriginalBackupFile(file);
        }
      } catch (error) {
        alert(`只读检查失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  return { handleExportFull, handleExportLight, downloadBackup, handleSystemBackupImport, handleSystemBackupInspect };
}
