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
import { compressStoredMemories } from "../../../core/storage/repositories/memoryRepository";
import { formatMemoryCompressionResult } from "../../../core/storage/memoryCompression";
import { formatStorageBytes } from "../../../core/storage/storageDiagnostics";
import {
  getCharacterPhoneStorageUsage,
  migrateLegacyCharacterPhones,
  type CharacterPhoneStorageUsage,
} from "../../../core/storage/repositories/characterPhoneRepository";
import {
  deleteSelectedUserAppData,
  getUserDataAppUsage,
  getUserDataAppOption,
  USER_DATA_RESET_EVENT,
  USER_DATA_APP_OPTIONS,
  type UserDataAppId,
} from "../userDataDeletion";

interface StorageCachePanelProps {
  mode: StorageCacheScope;
  ownerIdentityId?: string;
  characterId?: string;
  characterName?: string;
  galleryAssetIds?: readonly string[];
}

function optionsFor(mode: StorageCacheScope): readonly StorageCacheOption[] {
  return mode === "characterPhone" ? CHARACTER_PHONE_CACHE_OPTIONS : USER_STORAGE_CACHE_OPTIONS;
}

function confirmationText(mode: StorageCacheScope, option: StorageCacheOption | null): string {
  const targetLabel = mode === "user" && !option ? "所有应用缓存" : option?.label || "全部可重建缓存";
  const owner = mode === "characterPhone" ? "当前角色手机中的" : !option ? "所有应用的" : "该应用的";
  return `确定${targetLabel}吗？只会清理${owner}临时缓存，不会删除聊天、朋友圈、相册、日记、备忘录或其他正式数据。`;
}

export function StorageCachePanel({ mode, ownerIdentityId, characterId, characterName, galleryAssetIds }: StorageCachePanelProps) {
  const options = optionsFor(mode);
  const targets = useMemo<readonly StorageCacheTarget[]>(() => [...options.map((option) => option.id), "all"], [options]);
  const [usage, setUsage] = useState(() => getRebuildableCacheUsage({ scope: mode, scopeId: characterId, targets }));
  const [phoneStorage, setPhoneStorage] = useState<CharacterPhoneStorageUsage>(() =>
    getCharacterPhoneStorageUsage(ownerIdentityId, characterId));
  const [busyTarget, setBusyTarget] = useState<StorageCacheTarget | null>(null);
  const [notice, setNotice] = useState("");
  const [browserStorage, setBrowserStorage] = useState<{ usage?: number; quota?: number }>({});
  const [compressionBusy, setCompressionBusy] = useState<"all" | "images" | "stickers" | "memory" | null>(null);
  const [selectedDataApps, setSelectedDataApps] = useState<UserDataAppId[]>([]);
  const [dataUsage, setDataUsage] = useState(() => getUserDataAppUsage());

  const refreshUsage = useCallback(() => {
    setUsage(getRebuildableCacheUsage({ scope: mode, scopeId: characterId, targets }));
    if (mode === "user") setDataUsage(getUserDataAppUsage());
    if (mode === "characterPhone") {
      setPhoneStorage(getCharacterPhoneStorageUsage(ownerIdentityId, characterId));
    }
  }, [characterId, mode, ownerIdentityId, targets]);

  useEffect(() => {
    refreshUsage();
    if (mode !== "characterPhone") return;
    const migration = migrateLegacyCharacterPhones();
    if (migration.migratedCount > 0) {
      setNotice(`已整理 ${migration.migratedCount} 个角色手机的旧存储`);
      refreshUsage();
    } else if (!migration.result.success && migration.result.error === "quota") {
      setNotice("角色手机旧存储仍有部分未迁移；当前浏览器空间不足，正式数据未被删除");
    }
  }, [refreshUsage]);

  useEffect(() => {
    if (mode !== "characterPhone") return;
    const refreshAfterPhoneStorageChange = () => refreshUsage();
    window.addEventListener("character-phone-storage-ready", refreshAfterPhoneStorageChange);
    window.addEventListener("character-phone-storage-error", refreshAfterPhoneStorageChange);
    return () => {
      window.removeEventListener("character-phone-storage-ready", refreshAfterPhoneStorageChange);
      window.removeEventListener("character-phone-storage-error", refreshAfterPhoneStorageChange);
    };
  }, [mode, refreshUsage]);

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
    if (busyTarget || compressionBusy) return;
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

  const handleDeleteSelectedData = async () => {
    if (busyTarget || compressionBusy || selectedDataApps.length === 0) {
      if (selectedDataApps.length === 0) setNotice("请先选择要删除的应用数据。");
      return;
    }
    const labels = selectedDataApps.map((appId) => getUserDataAppOption(appId).label).join("、");
    if (!window.confirm(`确定删除${labels}的数据吗？这些应用会恢复为初始状态，未选择的应用和设置绝对不会被改动，且无法撤销。`)) return;
    setCompressionBusy("all");
    setNotice(`正在删除${labels}的数据，请稍候…`);
    try {
      const result = await deleteSelectedUserAppData(selectedDataApps);
      if (result.failedKeys.length > 0) {
        setNotice(`已删除 ${result.removedKeys.length} 项数据，但有 ${result.failedKeys.length} 项未能删除，请稍后重试。`);
        return;
      }
      setNotice(`已删除${labels}的数据，正在恢复应用初始状态…`);
      setSelectedDataApps([]);
      setDataUsage(getUserDataAppUsage());
      // Reset the root app in-process instead of forcing a full document
      // reload.  Reloading from an embedded/mobile browser can race lazy
      // chunks and leave only the wallpaper visible with no way back.
      window.dispatchEvent(new CustomEvent(USER_DATA_RESET_EVENT, {
        detail: { apps: result.apps },
      }));
    } catch (error) {
      setNotice(`删除失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setCompressionBusy(null);
    }
  };

  const handleCompress = async (kind: "all" | "images" | "stickers" | "memory") => {
    if (busyTarget || compressionBusy) return;
    const label = kind === "all" ? "图片和表情包" : kind === "images" ? "相册图片" : kind === "stickers" ? "表情包" : "旧记忆";
    const detail = kind === "memory"
      ? "只整理较久以前的非手动记忆，手动记忆和高重要性记忆不会改动。"
      : "图片尺寸和正常展示会保持不变，正式记录不会被删除。";
    if (!window.confirm(`确定压缩${label}吗？${detail}`)) return;
    setCompressionBusy(kind);
    setNotice("");
    try {
      if (kind === "memory") {
        const memoryResult = compressStoredMemories();
        if (!memoryResult.write.success) throw new Error("记忆压缩结果保存失败，原数据未被改动");
        setNotice(formatMemoryCompressionResult(memoryResult.result));
      } else {
        const result = kind === "all"
          ? await compressMediaAssets()
          : kind === "images"
            ? await compressImageAssets(mode === "characterPhone" ? (galleryAssetIds || []) : undefined)
            : await compressStickerAssets();
        setNotice(formatMediaCompressionResult(result));
      }
      void refreshBrowserStorage();
    } catch (error) {
      setNotice(`压缩失败，正式数据未被改动：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setCompressionBusy(null);
    }
  };

  const title = mode === "characterPhone" ? "角色手机缓存" : "应用缓存";
  const description = mode === "characterPhone"
    ? `仅清理${characterName || "当前角色"}手机中可重新生成的临时缓存，聊天、朋友圈和相册正式内容都会保留。`
    : "显示每个应用的缓存占用，统一清理所有可重新生成的临时文件，不会删除应用中的正式记录。";

  return (
    <section aria-label={title} className={`${mode === "user" ? "min-h-full" : ""} rounded-[24px] bg-white p-5 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-slate-800">{title}</h2>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">{description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
          {mode === "characterPhone"
            ? `正式数据 ${formatStorageBytes(phoneStorage.currentPhoneBytes)}`
            : `可清理 ${formatStorageBytes(totalUsage)}`}
        </span>
      </div>
      {mode === "characterPhone" && (
        <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-[10px] leading-4 text-sky-700">
          <p className="font-bold">当前角色手机正式数据：{formatStorageBytes(phoneStorage.currentPhoneBytes)}</p>
          <p className="mt-0.5 text-sky-600/80">
            全部角色手机本地数据：{formatStorageBytes(phoneStorage.totalPhoneBytes)}
            {phoneStorage.legacyBytes > 0 ? "（含待迁移旧存储）" : ""}
          </p>
          <p className="mt-0.5 text-sky-600/80">
            存储方式：{phoneStorage.backend === "indexeddb" ? "独立 IndexedDB（不占本地配置配额）" : "浏览器本地存储"}
          </p>
          <p className="mt-0.5 text-sky-600/80">下面的“可清理”只统计临时缓存，不会统计正式记录。</p>
        </div>
      )}

      <div className={mode === "user"
        ? "mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-2 sm:grid-cols-4"
        : "mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/50"}>
        {options.map((option) => {
          const itemUsage = usageFor(option.id);
          const isBusy = busyTarget === option.id;
          return (
            <div
              key={option.id}
              title={option.description}
              className={mode === "user"
                ? "min-w-0 rounded-xl border border-slate-100 bg-white px-2 py-2.5 text-center"
                : "flex items-center gap-3 px-3 py-3"}
            >
              <div className={mode === "user" ? "min-w-0" : "min-w-0 flex-1"}>
                <p className="truncate text-xs font-bold text-slate-700">{option.label}</p>
                {mode === "characterPhone" && (
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{option.description}</p>
                )}
              </div>
              <span className={mode === "user"
                ? "mt-1 block truncate text-[10px] font-semibold text-slate-400"
                : "shrink-0 text-[10px] font-semibold text-slate-400"}>
                {formatStorageBytes(itemUsage?.bytes ?? 0)}
              </span>
              {mode === "characterPhone" && (
                <button
                  type="button"
                  onClick={() => void handleClear(option.id, option)}
                  disabled={Boolean(busyTarget || compressionBusy)}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50"
                  aria-label={`清理${option.label}缓存`}
                >
                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  清理
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void handleClear("all")}
        disabled={Boolean(busyTarget || compressionBusy)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50"
      >
        {busyTarget === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {mode === "user" ? "清理所有应用缓存" : "清理全部可重建缓存"}
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
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleCompress("all")}
            disabled={Boolean(busyTarget || compressionBusy)}
            className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
          >
            {compressionBusy === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            压缩图片和表情包
          </button>
          <button
            type="button"
            onClick={() => void handleCompress("memory")}
            disabled={Boolean(busyTarget || compressionBusy)}
            className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
          >
            {compressionBusy === "memory" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            压缩旧记忆
          </button>
        </div>
      )}

      {mode === "user" && (
        <section aria-label="数据删除" className="mt-5 rounded-2xl bg-rose-50/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-extrabold text-slate-800">数据删除</h3>
              <p className="mt-1 text-[10px] leading-4 text-slate-600">按应用选择后彻底删除，选中的应用会恢复为初始状态；未选择的应用、API、外观和其他设置不会被改动。</p>
            </div>
            <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-700">不可撤销</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-rose-100 bg-rose-50/30 p-2 sm:grid-cols-4">
            {USER_DATA_APP_OPTIONS.map((option) => {
              const selected = selectedDataApps.includes(option.id);
              const itemUsage = dataUsage.find((entry) => entry.appId === option.id);
              return (
                <label
                  key={option.id}
                  title={option.description}
                  className={`min-w-0 cursor-pointer rounded-xl border px-2 py-2.5 text-center transition-colors ${selected ? "border-rose-300 bg-rose-50" : "border-rose-100 bg-white/80 hover:bg-rose-50/60"}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => setSelectedDataApps((current) => selected ? current.filter((id) => id !== option.id) : [...current, option.id])}
                    className="sr-only"
                  />
                  <span className="flex min-w-0 items-center justify-center">
                    <span className="truncate text-xs font-bold text-slate-700">{option.label}</span>
                  </span>
                  <span className="mt-1 block truncate text-[10px] font-semibold text-slate-400">{formatStorageBytes(itemUsage?.bytes ?? 0)}</span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void handleDeleteSelectedData()}
            disabled={Boolean(busyTarget || compressionBusy)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:opacity-50"
          >
            {compressionBusy === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            删除所选应用数据
          </button>
        </section>
      )}

      {notice && <p role="status" className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-[10px] leading-4 text-slate-600">{notice}</p>}
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
    </section>
  );
}
