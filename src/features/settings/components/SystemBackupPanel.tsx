import type { ChangeEvent } from "react";
import { Download, Upload } from "lucide-react";

interface SystemBackupPanelProps {
  showExportOptions: boolean;
  onOpenExportOptions: () => void;
  onCloseExportOptions: () => void;
  onExportFull: () => void;
  onExportLight: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onInspect: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function SystemBackupPanel({
  showExportOptions,
  onOpenExportOptions,
  onCloseExportOptions,
  onExportFull,
  onExportLight,
  onImport,
  onInspect,
}: SystemBackupPanelProps) {
  return (
    <>
      <div className="settings-section-header">数据备份</div>
      {showExportOptions && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="backup-export-title">
          <div className="w-full max-w-sm rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.16)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 id="backup-export-title" className="text-base font-semibold text-[var(--text-primary)]">选择导出方式</h3>
              <button type="button" onClick={onCloseExportOptions} className="h-8 w-8 rounded-[12px] text-lg text-[var(--text-tertiary)]" aria-label="关闭">×</button>
            </div>
            <div className="space-y-2">
              <button type="button" onClick={onExportFull} className="w-full rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-left transition-colors hover:bg-[var(--surface-raised)]">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">完整导出</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--text-tertiary)]">导出系统配置与结构化数据；阅读小说请在“阅读”应用导出含正文的阅读归档</span>
              </button>
              <button type="button" onClick={onExportLight} className="w-full rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-left transition-colors hover:bg-[var(--surface-raised)]">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">轻量导出</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--text-tertiary)]">仅包含聊天、档案馆、世界书、记忆书、日记、线上线下</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">数据备份与还原</h3>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          可以将本机配置和结构化数据打包导出，包含角色与朋友圈等 IndexedDB 数据。音频和本地封面不会写入 JSON，小说正文也不会写入系统 JSON；小说请在“阅读”应用使用独立阅读归档，才能连同正文、进度和标注一起恢复。
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onOpenExportOptions} className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-[16px] transition-all group">
            <Download className="w-5 h-5 text-slate-600 mb-1.5 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-slate-700">导出数据备份</span>
            <span className="text-[8px] text-slate-400 mt-1">下载备份 JSON 文件</span>
          </button>
          <label className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-[16px] transition-all group cursor-pointer">
            <Upload className="w-5 h-5 text-slate-600 mb-1.5 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-slate-700">导入备份还原</span>
            <span className="text-[8px] text-slate-400 mt-1">上传备份 JSON 文件</span>
            <input type="file" accept="application/json" onChange={onImport} className="hidden" />
          </label>
        </div>
        <label className="flex cursor-pointer items-center justify-between rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-2 hover:bg-slate-100">
          <span>
            <span className="block text-xs font-bold text-slate-700">只读检查 / 导出原始备份</span>
            <span className="block text-[9px] text-slate-400">查看摘要、模块状态和失败原因；可另存原始文件，不会修改当前数据</span>
          </span>
          <input type="file" accept="application/json" onChange={onInspect} className="hidden" />
        </label>
      </div>
    </>
  );
}
