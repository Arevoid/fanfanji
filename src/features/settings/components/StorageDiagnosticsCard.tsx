import { formatStorageBytes, type StorageDiagnostics } from "../../../core/storage/storageDiagnostics";
import type { StoragePreflightResult } from "../../../core/storage/storagePreflight";
import { loadApiUsageMetrics, summarizeApiUsage } from "../../../core/monitoring/apiUsageMetrics";
import { loadRuntimeErrorMetrics, summarizeRuntimeErrors } from "../../../core/monitoring/runtimeErrorMetrics";

interface StorageDiagnosticsCardProps {
  diagnostics: StorageDiagnostics | null;
  preflight: StoragePreflightResult | null;
  appVersion: string;
  backupVersion: number;
  lastBackupAt: string | null;
  onRefresh: () => void;
  onRunPreflight: () => void;
  onRunContentMigration: () => void;
  onResumeInterruptedMigration: () => void;
  contentMigrationRunning: boolean;
  onRequestPersistence: () => void;
  onDownloadDiagnosticReport: () => void;
  onCleanOrphanedResources: () => void;
  onCleanMigratedCopies: () => void;
}

export function StorageDiagnosticsCard({
  diagnostics,
  preflight,
  appVersion,
  backupVersion,
  lastBackupAt,
  onRefresh,
  onRunPreflight,
  onRunContentMigration,
  onResumeInterruptedMigration,
  contentMigrationRunning,
  onRequestPersistence,
  onDownloadDiagnosticReport,
  onCleanOrphanedResources,
  onCleanMigratedCopies,
}: StorageDiagnosticsCardProps) {
  const apiUsage = summarizeApiUsage(loadApiUsageMetrics());
  const runtimeErrors = summarizeRuntimeErrors(loadRuntimeErrorMetrics());
  return (
    <>
      <div className="settings-section-header">存储空间</div>
      <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">本地存储诊断</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">完整聊天、角色和线下故事优先保存在 IndexedDB，不再重复占用 LocalStorage。</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onRefresh} className="rounded-[10px] bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600">检查空间</button>
            <button type="button" onClick={onRunPreflight} className="rounded-[10px] bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600">迁移预检</button>
          </div>
        </div>
        {diagnostics && (
          <div className="rounded-[12px] bg-slate-50 p-3 text-[10px] text-slate-600 space-y-1">
            <div>LocalStorage：{formatStorageBytes(diagnostics.localStorageBytes)}</div>
            <div>浏览器总占用：{diagnostics.usage === undefined ? "不可用" : formatStorageBytes(diagnostics.usage)} / {diagnostics.quota === undefined ? "未知" : formatStorageBytes(diagnostics.quota)}</div>
            <div>应用版本：v{appVersion}</div>
            <div>数据版本：{diagnostics.dataSchemaVersion || "未设置（兼容模式）"}</div>
            <div>当前 schema 基线：v{diagnostics.currentSchemaVersion}</div>
            <div>迁移脚本版本：{diagnostics.migrationScriptVersion}</div>
            <div>备份版本：v{backupVersion}</div>
            <div>API 调用统计（近 90 天）：{apiUsage.requests} 次，成功 {apiUsage.successes}，失败 {apiUsage.failures}，输入 {apiUsage.inputCharacters} 字符，输出 {apiUsage.outputCharacters} 字符</div>
            <div>运行时错误统计（近 30 天）：{runtimeErrors.total} 次，{runtimeErrors.buckets} 种错误类型（仅记录类型与次数）</div>
            <div>最近备份：{lastBackupAt ? new Date(Number(lastBackupAt)).toLocaleString() : "暂无记录"}</div>
            <div>最近迁移：{diagnostics.migrationState?.phase === "completed" ? new Date(diagnostics.migrationState.updatedAt).toLocaleString() : "暂无已完成迁移"}</div>
            <div>未完成迁移：{diagnostics.migrationState && diagnostics.migrationState.phase !== "completed" ? "是" : "否"}</div>
            {diagnostics.characterKnowledgeMigration && <div>
              Truth Layer 迁移：{diagnostics.characterKnowledgeMigration.status === "completed" ? "已完成" : diagnostics.characterKnowledgeMigration.status === "failed" ? "失败（已保留旧数据）" : "未执行"}
              （记忆 {diagnostics.characterKnowledgeMigration.migratedMemoryIds.length}，摘要 {diagnostics.characterKnowledgeMigration.migratedSummaryIds.length}，行为纠正 {diagnostics.characterKnowledgeMigration.migratedCorrectionIds.length}，待核对孤立记录 {diagnostics.characterKnowledgeMigration.orphanRecordIds.length}）
            </div>}
            {diagnostics.characterKnowledgeMigration?.lastError && <div className="text-amber-700">Truth Layer 迁移提示：{diagnostics.characterKnowledgeMigration.lastError}</div>}
            <div>持久化许可：{diagnostics.persisted === undefined ? "未知" : diagnostics.persisted ? "已启用" : "未启用"}</div>
            {diagnostics.migrationState && <div>迁移状态：{diagnostics.migrationState.phase}（{diagnostics.migrationState.completedModules.length} 个模块已完成）</div>}
            {diagnostics.migrationState && diagnostics.migrationState.phase !== "completed" && diagnostics.migrationState.phase !== "failed" && diagnostics.migrationState.phase !== "cancelled" && <button type="button" disabled={contentMigrationRunning} onClick={onResumeInterruptedMigration} className="mt-2 rounded-[10px] bg-amber-600 px-3 py-2 font-bold text-white disabled:opacity-50">恢复未完成迁移</button>}
            {diagnostics.migrationState?.report && <div>迁移报告：完成 {diagnostics.migrationState.report.completed}，跳过 {diagnostics.migrationState.report.skipped}，修复 {diagnostics.migrationState.report.repaired}，失败 {diagnostics.migrationState.report.failed}</div>}
            {diagnostics.migrationLock && <div>迁移锁：{diagnostics.migrationLock.ownerId}，有效至 {new Date(diagnostics.migrationLock.expiresAt).toLocaleString()}</div>}
            <div>状态：{diagnostics.pressure === "critical" ? "空间严重不足" : diagnostics.pressure === "warning" ? "空间偏高" : diagnostics.pressure === "normal" ? "正常" : "未知"}</div>
            <div>健康扫描：已检查 {diagnostics.health.checkedCollections} 个数据集合，发现 {diagnostics.health.findings.length} 项待检查问题</div>
            {diagnostics.identitySummary && <div>身份关系摘要：{diagnostics.identitySummary.identityCount} 个身份，当前身份{diagnostics.identitySummary.activeIdentityIdPresent ? "有效" : "无效"}；{diagnostics.identitySummary.identities.map((identity) => `${identity.idFingerprint} 好友 ${identity.relationshipCount} 人`).join("、")}</div>}
            {diagnostics.health.indexedDb.length > 0 && <div>IndexedDB：{diagnostics.health.indexedDb.map((database) => `${database.name}（${database.records} 条）`).join("、")}</div>}
            {diagnostics.health.resources.length > 0 && <div>资源引用：{diagnostics.health.resources.map((resource) => `${resource.database}/${resource.store}（已存 ${resource.stored}，引用 ${resource.referenced}，孤儿 ${resource.orphaned}，缺失 ${resource.missing}）`).join("；")}</div>}
            {diagnostics.health.findings.slice(0, 5).map((finding) => <div key={`${finding.key}-${finding.kind}`} className="text-amber-700">待检查：{finding.key} · {finding.detail}</div>)}
            {diagnostics.localStorageEntries.slice(0, 3).map((entry) => <div key={entry.key} className="truncate">最大项目：{entry.key}（{formatStorageBytes(entry.bytes)}）</div>)}
            {!diagnostics.persisted && <button type="button" onClick={onRequestPersistence} className="mt-2 rounded-[10px] bg-white px-3 py-2 font-bold text-slate-600 border border-slate-200">申请浏览器持久化存储</button>}
            <button type="button" onClick={onDownloadDiagnosticReport} className="mt-2 rounded-[10px] bg-white px-3 py-2 font-bold text-slate-600 border border-slate-200">下载无隐私诊断报告</button>
            <button type="button" onClick={onCleanOrphanedResources} className="mt-2 rounded-[10px] bg-white px-3 py-2 font-bold text-slate-600 border border-slate-200">清理已确认孤儿资源</button>
            <button type="button" onClick={onCleanMigratedCopies} className="mt-2 rounded-[10px] bg-white px-3 py-2 font-bold text-slate-600 border border-slate-200">清理已迁移副本</button>
          </div>
        )}
        {preflight && (
          <div className="rounded-[12px] border border-slate-100 bg-white p-3 text-[10px] text-slate-600 space-y-1">
            <div className="font-bold">迁移预检：{preflight.status === "ready" ? "可进入下一步评估" : preflight.status === "warning" ? "存在提醒" : preflight.status === "blocked" ? "暂不可迁移" : "无法确认"}</div>
            <div>检查时间：{new Date(preflight.capturedAt).toLocaleString()}</div>
            <div>预计新增占用：{formatStorageBytes(preflight.estimatedAdditionalBytes)}；建议可用空间：{formatStorageBytes(preflight.recommendedFreeBytes)}</div>
            {preflight.availableBytes !== undefined && <div>当前可用空间：{formatStorageBytes(preflight.availableBytes)}</div>}
            <div>聊天条目库：{preflight.messageEntryStoreEnabled ? "已启用" : "未启用"}；线下条目库：{preflight.offlineStoryEntryStoreEnabled ? "已启用" : "未启用"}</div>
            {preflight.modules.map((module) => <div key={module.id}>{module.label}：当前约 {formatStorageBytes(module.estimatedCurrentBytes)}；{module.sources.filter((source) => source.source !== "missing").map((source) => `${source.label} ${source.records} 条`).join("、") || "未发现数据源"}</div>)}
            {preflight.warnings.map((warning) => <div key={warning} className="text-amber-700">提醒：{warning}</div>)}
            <div className="pt-1 text-slate-400">本次预检只读，不会迁移、覆盖或清理任何数据。</div>
            {(!preflight.messageEntryStoreEnabled || !preflight.offlineStoryEntryStoreEnabled) && <button type="button" disabled={contentMigrationRunning} onClick={onRunContentMigration} className="mt-2 rounded-[10px] bg-slate-900 px-3 py-2 font-bold text-white disabled:opacity-50">{contentMigrationRunning ? "迁移进行中…" : "备份后开始聊天/线下存储迁移"}</button>}
          </div>
        )}
      </div>
    </>
  );
}
