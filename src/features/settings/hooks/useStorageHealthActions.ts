import { useState } from "react";
import { buildStorageDiagnosticReport, inspectStorage, type StorageDiagnostics } from "../../../core/storage/storageDiagnostics";
import { runStoragePreflight, type StoragePreflightResult } from "../../../core/storage/storagePreflight";
import { migrateContentStorage } from "../../../core/storage/contentStorageMigration";
import { APP_VERSION } from "../../../core/release/releaseInfo";
import { SYSTEM_BACKUP_VERSION } from "../systemBackup";

interface UseStorageHealthActionsOptions {
  downloadLightBackup: () => Promise<void>;
}

/** Owns storage health, migration preflight, and content migration UI state. */
export function useStorageHealthActions({ downloadLightBackup }: UseStorageHealthActionsOptions) {
  const [storageDiagnostics, setStorageDiagnostics] = useState<StorageDiagnostics | null>(null);
  const [storagePreflight, setStoragePreflight] = useState<StoragePreflightResult | null>(null);
  const [isContentStorageMigrationRunning, setIsContentStorageMigrationRunning] = useState(false);

  const refreshStorageDiagnostics = async () => {
    try {
      setStorageDiagnostics(await inspectStorage());
    } catch (error) {
      console.warn("Unable to inspect browser storage.", error);
    }
  };

  const downloadStorageDiagnosticReport = () => {
    if (!storageDiagnostics) {
      alert("请先点击“检查空间”生成诊断信息。");
      return;
    }
    const report = buildStorageDiagnosticReport(storageDiagnostics, APP_VERSION, SYSTEM_BACKUP_VERSION);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fanfanji_storage_diagnostic_${new Date(report.capturedAt).toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const runStorageMigrationPreflight = async () => {
    try {
      setStoragePreflight(await runStoragePreflight());
    } catch (error) {
      console.warn("Unable to run storage migration preflight.", error);
      alert("迁移预检失败，现有数据未被修改。请先导出备份后重试。");
    }
  };

  const runContentStorageMigration = async (resumeInterrupted = false) => {
    if (isContentStorageMigrationRunning) return;
    const prompt = resumeInterrupted
      ? "检测到上次迁移中断。将接管已过期的迁移锁，跳过已完成模块，继续未完成模块并重新校验；不会删除旧数据。确认恢复吗？"
      : "迁移前会自动下载一份完整备份。迁移将保留旧聊天和旧线下故事副本，不会修改角色、世界书、记忆或 API 配置。确认开始吗？";
    if (!confirm(prompt)) return;
    setIsContentStorageMigrationRunning(true);
    try {
      await downloadLightBackup();
      if (!confirm("迁移前备份已生成并开始下载。请确认已保存原始备份文件，再继续迁移；取消将保持当前数据不变。")) {
        setIsContentStorageMigrationRunning(false);
        return;
      }
      const report = await migrateContentStorage({ preflight: storagePreflight || undefined, resumeInterrupted });
      alert(`迁移完成：${report.messageCount} 条聊天消息、${report.offlineStoryCount} 个线下故事（${report.offlineStoryMessageCount} 条线下消息）。旧数据副本已保留，应用将刷新。`);
      window.location.reload();
    } catch (error: any) {
      alert(`迁移失败，旧数据未删除：${error?.message || "未知错误"}`);
      setIsContentStorageMigrationRunning(false);
      await refreshStorageDiagnostics();
    }
  };

  const requestStoragePersistence = async () => {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) {
      alert("当前浏览器不支持持久化存储申请。");
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      await refreshStorageDiagnostics();
      alert(granted ? "已申请并启用持久化存储。" : "浏览器未授予持久化存储，现有数据不会被删除。");
    } catch (error) {
      console.warn("Unable to request persistent browser storage.", error);
      alert("持久化存储申请失败，现有数据不会被删除。");
    }
  };

  return {
    storageDiagnostics,
    storagePreflight,
    isContentStorageMigrationRunning,
    refreshStorageDiagnostics,
    downloadStorageDiagnosticReport,
    runStorageMigrationPreflight,
    runContentStorageMigration,
    requestStoragePersistence,
  };
}
