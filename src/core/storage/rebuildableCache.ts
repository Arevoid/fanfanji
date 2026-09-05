import { remove } from "./storageAdapter";
import {
  cleanupOrphanedStorageResources,
  type OrphanedResourceCleanupEntry,
} from "./storageDiagnostics";
import { storageKeys } from "./storageKeys";

/**
 * Storage cleanup deliberately uses a whitelist.  A record is considered a
 * cache only when it is either one of the transient keys below or is stored
 * under the rebuildable-cache namespace.  Formal content keys (messages,
 * moments, diaries, gallery metadata, memories, etc.) are never part of this
 * list and therefore cannot be removed by this feature.
 */

export type UserStorageAppId =
  | "chat"
  | "offline"
  | "diary"
  | "cinema"
  | "reading"
  | "browser"
  | "schedule"
  | "gallery"
  | "music"
  | "notes"
  | "moments"
  | "forum"
  | "memory"
  | "other";

export type CharacterPhoneCacheId =
  | "chat"
  | "moments"
  | "browser"
  | "gallery"
  | "music"
  | "stickers";

export type StorageCacheTarget = UserStorageAppId | CharacterPhoneCacheId | "all";
export type StorageCacheScope = "user" | "characterPhone";

export interface StorageCacheOption {
  id: Exclude<StorageCacheTarget, "all">;
  label: string;
  description: string;
}

export const USER_STORAGE_CACHE_OPTIONS: readonly StorageCacheOption[] = [
  { id: "chat", label: "聊天", description: "消息预览、生成临时文件" },
  { id: "offline", label: "线下", description: "剧本加载和临时渲染文件" },
  { id: "diary", label: "日记", description: "翻译和生成任务临时数据" },
  { id: "cinema", label: "影视", description: "封面和页面预览缓存" },
  { id: "reading", label: "阅读", description: "封面、分析和阅读页面缓存" },
  { id: "browser", label: "浏览器", description: "网页预览和页面临时缓存" },
  { id: "schedule", label: "日程", description: "日历视图临时缓存" },
  { id: "gallery", label: "相册", description: "缩略图和无引用图片资源" },
  { id: "music", label: "音乐", description: "封面和播放临时缓存" },
  { id: "notes", label: "备忘录", description: "编辑器临时草稿缓存" },
  { id: "moments", label: "朋友圈", description: "动态生成和主题临时数据" },
  { id: "forum", label: "论坛", description: "翻译和页面临时数据" },
  { id: "memory", label: "记忆", description: "检索和生成临时数据" },
  { id: "other", label: "其他应用", description: "其他应用登记的临时缓存" },
];

export const CHARACTER_PHONE_CACHE_OPTIONS: readonly StorageCacheOption[] = [
  { id: "chat", label: "清理聊天缓存", description: "消息预览和生成临时数据" },
  { id: "moments", label: "清理朋友圈缓存", description: "动态列表和评论区临时数据" },
  { id: "browser", label: "清理浏览器缓存", description: "网页缩略图和页面临时数据" },
  { id: "gallery", label: "清理相册缓存", description: "预览图和无引用图片资源" },
  { id: "music", label: "清理音乐缓存", description: "封面和播放临时数据" },
  { id: "stickers", label: "清理表情包缓存", description: "预览和解码临时数据" },
];

const USER_CACHE_KEYS: Partial<Record<UserStorageAppId, readonly string[]>> = {
  diary: [storageKeys.diaryGenerationTasks, storageKeys.diaryTranslations],
  moments: [storageKeys.momentGenerationTasks, storageKeys.momentTopicHistory, storageKeys.proactiveTopicHistory],
  forum: [storageKeys.forumTranslations],
  other: [storageKeys.backgroundSchedulerTasks, storageKeys.backgroundSchedulerLeases, storageKeys.backgroundSchedulerClock],
};

const ROLE_CACHE_KEYS: Partial<Record<CharacterPhoneCacheId, readonly string[]>> = {};

const REBUILDABLE_CACHE_PREFIX = "phone_rebuildable_cache_v1:";
const CACHE_STORAGE_PREFIXES = ["fanfan-phone-", "fanfanji-"];

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function scopedPrefix(scope: StorageCacheScope, scopeId: string | undefined, target: StorageCacheTarget): string {
  const normalizedScopeId = scope === "characterPhone" ? (scopeId || "unknown") : "global";
  return `${REBUILDABLE_CACHE_PREFIX}${scope}:${normalizedScopeId}:${target}:`;
}

function collectLocalStorageKeys(prefixes: readonly string[], exactKeys: readonly string[]): string[] {
  const storage = getStorage();
  if (!storage) return [];
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix)) || exactKeys.includes(key)) keys.push(key);
  }
  return keys;
}

function getTargetKeys(scope: StorageCacheScope, target: StorageCacheTarget): readonly string[] {
  if (scope === "characterPhone") {
    if (target === "all") return Object.values(ROLE_CACHE_KEYS).flatMap((keys) => keys || []);
    return ROLE_CACHE_KEYS[target] || [];
  }
  if (target === "all") return Object.values(USER_CACHE_KEYS).flatMap((keys) => keys || []);
  return USER_CACHE_KEYS[target] || [];
}

function getTargetPrefix(scope: StorageCacheScope, scopeId: string | undefined, target: StorageCacheTarget): string {
  return scopedPrefix(scope, scopeId, target);
}

function getTargetPrefixes(scope: StorageCacheScope, scopeId: string | undefined, target: StorageCacheTarget): string[] {
  if (target !== "all") return [getTargetPrefix(scope, scopeId, target)];
  const options = scope === "characterPhone" ? CHARACTER_PHONE_CACHE_OPTIONS : USER_STORAGE_CACHE_OPTIONS;
  return options.map((option) => getTargetPrefix(scope, scopeId, option.id));
}

async function clearOriginCaches(): Promise<string[]> {
  if (typeof caches === "undefined") return [];
  try {
    const names = await caches.keys();
    const rebuildableNames = names.filter((name) => CACHE_STORAGE_PREFIXES.some((prefix) => name.startsWith(prefix)));
    const results = await Promise.all(rebuildableNames.map(async (name) => (await caches.delete(name)) ? name : null));
    return results.filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

async function cleanOrphanedResources(target: StorageCacheTarget): Promise<OrphanedResourceCleanupEntry[]> {
  if (target === "gallery") return cleanupOrphanedStorageResources({ stickers: false });
  if (target === "stickers") return cleanupOrphanedStorageResources({ images: false });
  if (target === "all") return cleanupOrphanedStorageResources();
  return [];
}

export interface StorageCacheCleanupResult {
  scope: StorageCacheScope;
  target: StorageCacheTarget;
  removedLocalStorageKeys: string[];
  removedCacheNames: string[];
  orphanedResources: OrphanedResourceCleanupEntry[];
  failedLocalStorageKeys: string[];
}

export async function clearRebuildableCache(options: {
  scope: StorageCacheScope;
  target: StorageCacheTarget;
  scopeId?: string;
}): Promise<StorageCacheCleanupResult> {
  const { scope, target, scopeId } = options;
  const exactKeys = getTargetKeys(scope, target);
  const prefixes = getTargetPrefixes(scope, scopeId, target);
  const keys = collectLocalStorageKeys(prefixes, exactKeys);
  const removedLocalStorageKeys: string[] = [];
  const failedLocalStorageKeys: string[] = [];
  for (const key of keys) {
    const result = remove(key);
    if (result.success) removedLocalStorageKeys.push(key);
    else failedLocalStorageKeys.push(key);
  }
  const shouldClearOriginCaches = target === "browser" || target === "all";
  const [removedCacheNames, orphanedResources] = await Promise.all([
    shouldClearOriginCaches ? clearOriginCaches() : Promise.resolve([]),
    cleanOrphanedResources(target),
  ]);
  return {
    scope,
    target,
    removedLocalStorageKeys,
    removedCacheNames,
    orphanedResources,
    failedLocalStorageKeys,
  };
}

export interface StorageCacheUsage {
  target: StorageCacheTarget;
  bytes: number;
  localStorageKeys: number;
}

function byteLength(value: string): number {
  // localStorage uses UTF-16 in most browsers.  Counting two bytes per code
  // unit is intentionally conservative and works in the same way as the
  // existing storage diagnostics page.
  return value.length * 2;
}

export function getRebuildableCacheUsage(options: {
  scope: StorageCacheScope;
  scopeId?: string;
  targets: readonly StorageCacheTarget[];
}): StorageCacheUsage[] {
  const storage = getStorage();
  if (!storage) return options.targets.map((target) => ({ target, bytes: 0, localStorageKeys: 0 }));
  return options.targets.map((target) => {
    const exactKeys = getTargetKeys(options.scope, target);
    const prefixes = getTargetPrefixes(options.scope, options.scopeId, target);
    const keys = collectLocalStorageKeys(prefixes, exactKeys);
    return keys.reduce<StorageCacheUsage>((usage, key) => {
      const value = storage.getItem(key) || "";
      return { target, bytes: usage.bytes + byteLength(key) + byteLength(value), localStorageKeys: usage.localStorageKeys + 1 };
    }, { target, bytes: 0, localStorageKeys: 0 });
  });
}

export function formatStorageCacheCleanupResult(result: StorageCacheCleanupResult): string {
  const orphanedCount = result.orphanedResources.reduce((total, entry) => total + entry.removed, 0);
  const removedCount = result.removedLocalStorageKeys.length + result.removedCacheNames.length + orphanedCount;
  if (removedCount === 0 && result.failedLocalStorageKeys.length === 0) return "没有发现可清理的缓存，正式数据未被改动。";
  return `已清理 ${removedCount} 项可重建缓存${result.failedLocalStorageKeys.length ? `，${result.failedLocalStorageKeys.length} 项未能清理` : ""}；正式数据未被改动。`;
}

export { REBUILDABLE_CACHE_PREFIX };
