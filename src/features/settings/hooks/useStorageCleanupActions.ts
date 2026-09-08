import { cleanupOrphanedStorageResources, removeMigratedStorageCopies } from "../../../core/storage/storageDiagnostics";

interface UseStorageCleanupActionsOptions {
  refreshStorageDiagnostics: () => Promise<void>;
}

/** Owns explicit, user-confirmed storage cleanup actions; nothing is automatic. */
export function useStorageCleanupActions({ refreshStorageDiagnostics }: UseStorageCleanupActionsOptions) {
  const cleanOrphanedResources = async () => {
    if (!confirm("只清理当前健康扫描确认没有引用的图片和表情资源，其他数据不会删除。确定继续吗？")) return;
    try {
      const entries = await cleanupOrphanedStorageResources();
      await refreshStorageDiagnostics();
      const removed = entries.reduce((total, entry) => total + entry.removed, 0);
      const failed = entries.reduce((total, entry) => total + entry.failed, 0);
      alert(`孤儿资源清理完成：删除 ${removed} 项${failed ? `，失败 ${failed} 项` : ""}。`);
    } catch (error) {
      alert(`孤儿资源清理失败：${error instanceof Error ? error.message : String(error)}。其他数据未自动删除。`);
    }
  };

  const cleanMigratedCopies = async () => {
    try {
      const removed = await removeMigratedStorageCopies();
      void refreshStorageDiagnostics();
      alert(removed.length ? `已清理 ${removed.length} 个已迁移副本。` : "没有可清理的已迁移副本。");
    } catch (error) {
      alert(`清理已迁移副本失败：${error instanceof Error ? error.message : String(error)}。原始数据未自动删除。`);
    }
  };

  return { cleanOrphanedResources, cleanMigratedCopies };
}
