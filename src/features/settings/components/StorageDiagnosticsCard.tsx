import { formatStorageBytes, type StorageDiagnostics } from "../../../core/storage/storageDiagnostics";

interface StorageDiagnosticsCardProps {
  diagnostics: StorageDiagnostics | null;
  appVersion: string;
  backupVersion: number;
  lastBackupAt: string | null;
  onRefresh: () => void;
  onRequestPersistence: () => void;
  onCleanMigratedCopies: () => void;
}

export function StorageDiagnosticsCard({
  diagnostics,
  appVersion,
  backupVersion,
  lastBackupAt,
  onRefresh,
  onRequestPersistence,
  onCleanMigratedCopies,
}: StorageDiagnosticsCardProps) {
  return (
    <>
      <div className="settings-section-header">存储空间</div>
      <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">本地存储诊断</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">完整聊天、角色和线下故事优先保存在 IndexedDB，不再重复占用 LocalStorage。</p>
          </div>
          <button type="button" onClick={onRefresh} className="rounded-[10px] bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600">检查空间</button>
        </div>
        {diagnostics && (
          <div className="rounded-[12px] bg-slate-50 p-3 text-[10px] text-slate-600 space-y-1">
            <div>LocalStorage：{formatStorageBytes(diagnostics.localStorageBytes)}</div>
            <div>浏览器总占用：{diagnostics.usage === undefined ? "不可用" : formatStorageBytes(diagnostics.usage)} / {diagnostics.quota === undefined ? "未知" : formatStorageBytes(diagnostics.quota)}</div>
            <div>应用版本：v{appVersion}</div>
            <div>数据版本：{diagnostics.dataSchemaVersion || "未设置（兼容模式）"}</div>
            <div>备份版本：v{backupVersion}</div>
            <div>最近备份：{lastBackupAt ? new Date(Number(lastBackupAt)).toLocaleString() : "暂无记录"}</div>
            <div>持久化许可：{diagnostics.persisted === undefined ? "未知" : diagnostics.persisted ? "已启用" : "未启用"}</div>
            {diagnostics.migrationState && <div>迁移状态：{diagnostics.migrationState.phase}（{diagnostics.migrationState.completedModules.length} 个模块已完成）</div>}
            <div>状态：{diagnostics.pressure === "critical" ? "空间严重不足" : diagnostics.pressure === "warning" ? "空间偏高" : diagnostics.pressure === "normal" ? "正常" : "未知"}</div>
            <div>健康扫描：已检查 {diagnostics.health.checkedCollections} 个数据集合，发现 {diagnostics.health.findings.length} 项待检查问题</div>
            {diagnostics.health.indexedDb.length > 0 && <div>IndexedDB：{diagnostics.health.indexedDb.map((database) => `${database.name}（${database.records} 条）`).join("、")}</div>}
            {diagnostics.health.resources.length > 0 && <div>资源引用：{diagnostics.health.resources.map((resource) => `${resource.database}/${resource.store}（已存 ${resource.stored}，引用 ${resource.referenced}，孤儿 ${resource.orphaned}，缺失 ${resource.missing}）`).join("；")}</div>}
            {diagnostics.health.findings.slice(0, 5).map((finding) => <div key={`${finding.key}-${finding.kind}`} className="text-amber-700">待检查：{finding.key} · {finding.detail}</div>)}
            {diagnostics.localStorageEntries.slice(0, 3).map((entry) => <div key={entry.key} className="truncate">最大项目：{entry.key}（{formatStorageBytes(entry.bytes)}）</div>)}
            {!diagnostics.persisted && <button type="button" onClick={onRequestPersistence} className="mt-2 rounded-[10px] bg-white px-3 py-2 font-bold text-slate-600 border border-slate-200">申请浏览器持久化存储</button>}
            <button type="button" onClick={onCleanMigratedCopies} className="mt-2 rounded-[10px] bg-white px-3 py-2 font-bold text-slate-600 border border-slate-200">清理已迁移副本</button>
          </div>
        )}
      </div>
    </>
  );
}
