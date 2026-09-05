import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, Loader2, Trash2 } from "lucide-react";
import {
  CHARACTER_PHONE_CACHE_OPTIONS,
  clearRebuildableCache,
  formatStorageCacheCleanupResult,
  getRebuildableCacheUsage,
  USER_STORAGE_CACHE_OPTIONS,
  type StorageCacheOption,
  type StorageCacheTarget,
  type StorageCacheScope,
} from "../../../core/storage/rebuildableCache";
import {
  compressImageAssets,
  compressMediaAssets,
  compressStickerAssets,
  formatMediaCompressionResult,
} from "../../../core/storage/mediaCompression";
import { formatStorageBytes } from "../../../core/storage/storageDiagnostics";

interface StorageCachePanelProps {
  mode: StorageCacheScope;
  characterId?: string;
  characterName?: string;
  galleryAssetIds?: readonly string[];
}

function optionsFor(mode: StorageCacheScope): readonly StorageCacheOption[] {
  return mode === "characterPhone" ? CHARACTER_PHONE_CACHE_OPTIONS : USER_STORAGE_CACHE_OPTIONS;
}

function confirmationText(mode: StorageCacheScope, option: StorageCacheOption | null): string {
  const targetLabel = option?.label || "全部可重建缓存";
  const owner = mode === "characterPhone" ? "当前角色手机中的" : "该应用的";
  return `确定${targetLabel}吗？只会清理${owner}临时缓存，不会删除聊天、朋友圈、相册、日记、备忘录或其他正式数据。`;
}

export function StorageCachePanel({ mode, characterId, characterName, galleryAssetIds }: StorageCachePanelProps) {
  const options = optionsFor(mode);
  const targets = useMemo<readonly StorageCacheTarget[]>(() => [...options.map((option) => option.id), "all"], [options]);
  const [usage, setUsage] = useState(() => getRebuildableCacheUsage({ scope: mode, scopeId: characterId, targets }));
  const [busyTarget, setBusyTarget] = useState<StorageCacheTarget | null>(null);
  const [notice, setNotice] = useState("");
  const [browserStorage, setBrowserStorage] = useState<{ usage?: number; quota?: number }>({});
  const [compressionBusy, setCompressionBusy] = useState<"all" | "images" | "stickers" | null>(null);

  const refreshUsage = useCallback(() => {
    setUsage(getRebuildableCacheUsage({ scope: mode, scopeId: characterId, targets }));
  }, [characterId, mode, targets]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  const refreshBrowserStorage = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return;
    try {
      const estimate = await navigator.storage.estimate();
      setBrowserStorage({ usage: estimate.usage, quota: estimate.quota });
    } catch {
      // Embedded browsers may expose no quota estimate; cleanup still works.
    }
  }, []);

  useEffect(() => {
    void refreshBrowserStorage();
  }, [refreshBrowserStorage]);

  const usageFor = (target: StorageCacheTarget) => usage.find((entry) => entry.target === target);
  const totalUsage = usageFor("all")?.bytes ?? usage
    .filter((entry) => entry.target !== "all")
    .reduce((total, entry) => total + entry.bytes, 0);

  const handleClear = async (target: StorageCacheTarget, option: StorageCacheOption | null = null) => {
    if (busyTarget) return;
    if (!window.confirm(confirmationText(mode, option))) return;
    setBusyTarget(target);
    setNotice("");
    try {
      const result = await clearRebuildableCache({ scope: mode, target, scopeId: characterId });
      setNotice(formatStorageCacheCleanupResult(result));
      refreshUsage();
      void refreshBrowserStorage();
    } catch (error) {
      setNotice(`清理失败，正式数据未被改动：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setBusyTarget(null);
    }
  };

  const handleCompress = async (kind: "all" | "images" | "stickers") => {
    if (busyTarget || compressionBusy) return;
    const label = kind === "all" ? "图片和表情包" : kind === "images" ? "相册图片" : "表情包";
    if (!window.confirm(`确定压缩${label}吗？图片尺寸和正常展示会保持不变，正式记录不会被删除。`)) return;
    setCompressionBusy(kind);
    setNotice("");
    try {
      const result = kind === "all"
        ? await compressMediaAssets()
        : kind === "images"
          ? await compressImageAssets(mode === "characterPhone" ? (galleryAssetIds || []) : undefined)
          : await compressStickerAssets();
      setNotice(formatMediaCompressionResult(result));
      void refreshBrowserStorage();
    } catch (error) {
      setNotice(`压缩失败，正式数据未被改动：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setCompressionBusy(null);
    }
  };

  const title = mode === "characterPhone" ? "角色手机缓存" : "按应用清理缓存";
  const description = mode === "characterPhone"
    ? `仅清理${characterName || "当前角色"}手机中可重新生成的临时缓存，聊天、朋友圈和相册正式内容都会保留。`
    : "按应用清理可重新生成的临时文件，不会删除应用中的正式记录。";

  return (
    <section aria-label={title} className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-slate-800">{title}</h2>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">{description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
          可清理 {formatStorageBytes(totalUsage)}
        </span>
      </div>

      <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/50">
        {options.map((option) => {
          const itemUsage = usageFor(option.id);
          const isBusy = busyTarget === option.id;
          return (
            <div key={option.id} className="flex items-center gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-700">{option.label}</p>
                <p className="mt-0.5 truncate text-[10px] text-slate-400">{option.description}</p>
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-slate-400">{formatStorageBytes(itemUsage?.bytes ?? 0)}</span>
              <button
                type="button"
                onClick={() => void handleClear(option.id, option)}
                disabled={Boolean(busyTarget)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50"
                aria-label={`清理${option.label}缓存`}
              >
                {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                清理
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void handleClear("all")}
        disabled={Boolean(busyTarget)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50"
      >
        {busyTarget === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        清理全部可重建缓存
      </button>

      {mode === "characterPhone" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleCompress("images")}
            disabled={Boolean(busyTarget || compressionBusy)}
            className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
          >
            {compressionBusy === "images" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            压缩相册图片
          </button>
          <button
            type="button"
            onClick={() => void handleCompress("stickers")}
            disabled={Boolean(busyTarget || compressionBusy)}
            className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
          >
            {compressionBusy === "stickers" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            压缩表情包
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void handleCompress("all")}
          disabled={Boolean(busyTarget || compressionBusy)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
        >
          {compressionBusy === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          压缩图片和表情包
        </button>
      )}

      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[10px] leading-4 text-emerald-700">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>安全保障：清理白名单之外的正式数据不会被触碰。</span>
      </div>
      {(browserStorage.usage !== undefined || browserStorage.quota !== undefined) && (
        <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
          浏览器存储：{browserStorage.usage === undefined ? "未知" : formatStorageBytes(browserStorage.usage)}
          {browserStorage.quota === undefined ? "" : ` / ${formatStorageBytes(browserStorage.quota)}`}
          {browserStorage.usage !== undefined && browserStorage.quota
            ? `（${Math.round((browserStorage.usage / browserStorage.quota) * 100)}%）`
            : ""}
        </div>
      )}
      {notice && <p role="status" className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-[10px] leading-4 text-slate-600">{notice}</p>}
    </section>
  );
}
