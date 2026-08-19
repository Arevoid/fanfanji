import { loadStorageMigrationState } from "./storageMigrationState";
import { readString } from "./storageAdapter";
import { storageKeys } from "./storageKeys";
import { isMessageEntryStoreEnabled, isOfflineStoryEntryStoreEnabled } from "./contentStorageFlags";

export type StoragePreflightModuleId = "messages" | "offlineStories";
export type StoragePreflightSource = "indexeddb" | "localStorage" | "missing" | "unavailable" | "error";
export type StoragePreflightStatus = "ready" | "warning" | "blocked" | "unknown";

export interface StoragePreflightSourceSummary {
  source: StoragePreflightSource;
  label: string;
  records: number;
  bytes: number;
  duplicateIds: number;
  invalidRecords: number;
}

export interface StoragePreflightModuleSummary {
  id: StoragePreflightModuleId;
  label: string;
  sources: StoragePreflightSourceSummary[];
  estimatedCurrentBytes: number;
}

export interface StoragePreflightResult {
  capturedAt: number;
  status: StoragePreflightStatus;
  usage?: number;
  quota?: number;
  availableBytes?: number;
  estimatedAdditionalBytes: number;
  recommendedFreeBytes: number;
  messageEntryStoreEnabled: boolean;
  offlineStoryEntryStoreEnabled: boolean;
  modules: StoragePreflightModuleSummary[];
  warnings: string[];
}

interface IndexedDbReadResult {
  source: StoragePreflightSource;
  value?: unknown;
  error?: string;
}

const MESSAGE_METADATA_DATABASE = "FanfanjiReadingMetadataDB";
const MESSAGE_METADATA_STORE = "metadata";
const MESSAGE_METADATA_KEY = "messages-v4";
const OFFLINE_DATABASE = "FanfanjiOfflineStoryDB";
const OFFLINE_STORE = "stories";

function summarizeArray(value: unknown, source: StoragePreflightSource, label: string, bytesOverride?: number): StoragePreflightSourceSummary {
  const isArray = Array.isArray(value);
  const records = isArray ? value : [];
  const ids = records
    .filter((record): record is Record<string, unknown> => Boolean(record && typeof record === "object" && !Array.isArray(record)))
    .map((record) => record.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const invalidRecords = isArray
    ? records.filter((record) => !record || typeof record !== "object" || Array.isArray(record)).length
    : 1;
  const serialized = (() => {
    try { return JSON.stringify(value); } catch { return ""; }
  })();
  return {
    source,
    label,
    records: records.length,
    bytes: bytesOverride ?? serialized.length * 2,
    duplicateIds: ids.length - new Set(ids).size,
    invalidRecords,
  };
}

function missingSummary(label: string): StoragePreflightSourceSummary {
  return { source: "missing", label, records: 0, bytes: 0, duplicateIds: 0, invalidRecords: 0 };
}

function readLocalStorageArray(storage: Storage | null, key: string, label: string): StoragePreflightSourceSummary {
  if (!storage) return { source: "unavailable", label, records: 0, bytes: 0, duplicateIds: 0, invalidRecords: 0 };
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { source: "error", label, records: 0, bytes: 0, duplicateIds: 0, invalidRecords: 1 };
  }
  if (raw === null) return missingSummary(label);
  try {
    return summarizeArray(JSON.parse(raw), "localStorage", label, raw.length * 2);
  } catch {
    return { source: "error", label, records: 0, bytes: raw.length * 2, duplicateIds: 0, invalidRecords: 1 };
  }
}

function listExistingDatabaseNames(): Promise<Set<string> | null> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return Promise.resolve(null);
  return indexedDB.databases()
    .then((databases) => new Set(databases
      .map((database) => database.name)
      .filter((name): name is string => typeof name === "string")))
    .catch(() => null);
}

function readExistingIndexedDbValue(databaseName: string, storeName: string, key?: IDBValidKey): Promise<IndexedDbReadResult> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve({ source: "unavailable", error: "IndexedDB 不可用" });
      return;
    }
    let settled = false;
    let database: IDBDatabase | null = null;
    const finish = (result: IndexedDbReadResult) => {
      if (settled) return;
      settled = true;
      database?.close();
      resolve(result);
    };
    const timer = globalThis.setTimeout(() => finish({ source: "error", error: "读取存储超时" }), 8000);
    const finishWithTimer = (result: IndexedDbReadResult) => {
      globalThis.clearTimeout(timer);
      finish(result);
    };
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => {
      database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        finishWithTimer({ source: "missing" });
        return;
      }
      const transaction = database.transaction(storeName, "readonly");
      const valueRequest = key === undefined
        ? transaction.objectStore(storeName).getAll()
        : transaction.objectStore(storeName).get(key);
      valueRequest.onsuccess = () => finishWithTimer({ source: "indexeddb", value: valueRequest.result });
      valueRequest.onerror = () => finishWithTimer({ source: "error", error: "读取存储失败" });
      transaction.onerror = () => finishWithTimer({ source: "error", error: "读取事务失败" });
    };
    request.onerror = () => finishWithTimer({ source: "error", error: "打开存储失败" });
    request.onblocked = () => finishWithTimer({ source: "error", error: "存储被其他页面占用" });
  });
}

function createModuleSummary(
  id: StoragePreflightModuleId,
  label: string,
  sources: StoragePreflightSourceSummary[],
): StoragePreflightModuleSummary {
  return {
    id,
    label,
    sources,
    // Existing IDB and LocalStorage copies can represent the same records.
    // Use the larger copy as the current footprint to avoid overestimating the
    // space needed for a future migration.
    estimatedCurrentBytes: Math.max(...sources.map((source) => source.bytes), 0),
  };
}

export async function runStoragePreflight(): Promise<StoragePreflightResult> {
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  const existingDatabaseNames = await listExistingDatabaseNames();
  const warnings: string[] = [];
  const localMessages = readLocalStorageArray(storage, storageKeys.messages, "LocalStorage 当前消息");
  const legacyMessages = localMessages.source === "missing"
    ? readLocalStorageArray(storage, storageKeys.legacyMessages, "LocalStorage 旧消息")
    : missingSummary("LocalStorage 旧消息（未作为当前来源读取）");
  const localOfflineStories = readLocalStorageArray(storage, storageKeys.offlineStories, "LocalStorage 线下故事");

  let indexedMessages: StoragePreflightSourceSummary;
  let indexedOfflineStories: StoragePreflightSourceSummary;
  if (existingDatabaseNames === null) {
    indexedMessages = { source: "unavailable", label: "IndexedDB 消息快照", records: 0, bytes: 0, duplicateIds: 0, invalidRecords: 0 };
    indexedOfflineStories = { source: "unavailable", label: "IndexedDB 线下故事", records: 0, bytes: 0, duplicateIds: 0, invalidRecords: 0 };
    warnings.push("当前浏览器无法列出已有 IndexedDB，无法完成完整迁移预检。");
  } else {
    if (existingDatabaseNames.has(MESSAGE_METADATA_DATABASE)) {
      const result = await readExistingIndexedDbValue(MESSAGE_METADATA_DATABASE, MESSAGE_METADATA_STORE, MESSAGE_METADATA_KEY);
      indexedMessages = result.source === "indexeddb"
        ? summarizeArray(result.value, "indexeddb", "IndexedDB 消息快照")
        : { source: result.source, label: "IndexedDB 消息快照", records: 0, bytes: 0, duplicateIds: 0, invalidRecords: result.source === "error" ? 1 : 0 };
      if (result.error) warnings.push(`消息快照：${result.error}。`);
    } else {
      indexedMessages = missingSummary("IndexedDB 消息快照");
    }
    if (existingDatabaseNames.has(OFFLINE_DATABASE)) {
      const result = await readExistingIndexedDbValue(OFFLINE_DATABASE, OFFLINE_STORE);
      indexedOfflineStories = result.source === "indexeddb"
        ? summarizeArray(result.value, "indexeddb", "IndexedDB 线下故事")
        : { source: result.source, label: "IndexedDB 线下故事", records: 0, bytes: 0, duplicateIds: 0, invalidRecords: result.source === "error" ? 1 : 0 };
      if (result.error) warnings.push(`线下故事：${result.error}。`);
    } else {
      indexedOfflineStories = missingSummary("IndexedDB 线下故事");
    }
  }

  const modules = [
    createModuleSummary("messages", "聊天消息", [indexedMessages, localMessages, legacyMessages]),
    createModuleSummary("offlineStories", "线下故事", [indexedOfflineStories, localOfflineStories]),
  ];
  const invalidCount = modules.reduce((total, module) => total + module.sources.reduce((sum, source) => sum + source.invalidRecords + source.duplicateIds, 0), 0);
  if (invalidCount > 0) warnings.push("发现重复 ID 或无法解析的记录，迁移前需要先导出备份并人工处理。未自动修复或删除任何数据。");

  const estimate: StorageEstimate = typeof navigator !== "undefined" && navigator.storage?.estimate
    ? await navigator.storage.estimate().catch(() => ({} as StorageEstimate))
    : {};
  const usage = estimate.usage;
  const quota = estimate.quota;
  const availableBytes = usage !== undefined && quota !== undefined ? Math.max(0, quota - usage) : undefined;
  const estimatedAdditionalBytes = modules.reduce((total, module) => total + module.estimatedCurrentBytes, 0);
  const recommendedFreeBytes = Math.ceil(estimatedAdditionalBytes * 1.25);
  if (availableBytes !== undefined && availableBytes < recommendedFreeBytes) {
    warnings.push("可用空间不足以安全保留新旧副本和迁移临时数据，当前不具备迁移条件。");
  } else if (availableBytes === undefined) {
    warnings.push("浏览器未提供可靠的容量估算，无法确认迁移所需的额外空间。");
  }

  const migrationState = loadStorageMigrationState();
  if (migrationState && migrationState.phase !== "completed") {
    warnings.push(`存在未完成的迁移状态（${migrationState.phase}），需要先恢复、回滚或人工确认。`);
  }
  const hasUnavailableSource = modules.some((module) => module.sources.some((source) => source.source === "unavailable" || source.source === "error"));
  const status: StoragePreflightStatus = migrationState && migrationState.phase !== "completed"
    || invalidCount > 0
    || availableBytes !== undefined && availableBytes < recommendedFreeBytes
    ? "blocked"
    : hasUnavailableSource || availableBytes === undefined
      ? "unknown"
      : warnings.length > 0 ? "warning" : "ready";

  return {
    capturedAt: Date.now(),
    status,
    usage,
    quota,
    availableBytes,
    estimatedAdditionalBytes,
    recommendedFreeBytes,
    messageEntryStoreEnabled: isMessageEntryStoreEnabled(),
    offlineStoryEntryStoreEnabled: isOfflineStoryEntryStoreEnabled(),
    modules,
    warnings,
  };
}
