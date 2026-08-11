import type { StorageResult, StorageWriteResult } from "./storageTypes";

function isQuotaExceededError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === "QuotaExceededError"
    || candidate.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || candidate.code === 22
    || candidate.code === 1014;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch (error) {
    console.warn("[storage] localStorage is unavailable.", error);
    return null;
  }
}

export function readString(key: string): StorageResult<string | null> {
  const storage = getStorage();
  if (!storage) return { value: null, found: false, valid: false, error: "unavailable" };

  try {
    const value = storage.getItem(key);
    return { value, found: value !== null, valid: true };
  } catch (error) {
    console.warn(`[storage] Failed to read "${key}".`, error);
    return { value: null, found: false, valid: false, error: "read" };
  }
}

export function readJson<T>(key: string, fallback: T): StorageResult<T> {
  const result = readString(key);
  if (!result.valid || !result.found || result.value === null) {
    return { value: fallback, found: result.found, valid: result.valid, error: result.error };
  }

  try {
    return { value: JSON.parse(result.value) as T, found: true, valid: true };
  } catch (error) {
    console.warn(`[storage] Invalid JSON in "${key}". The original value was left untouched.`, error);
    return { value: fallback, found: true, valid: false, error: "parse" };
  }
}

export function writeString(key: string, value: string): StorageWriteResult {
  const storage = getStorage();
  if (!storage) return { success: false, error: "unavailable" };
  if (typeof value !== "string") {
    console.warn(`[storage] Refused to write a non-string value to "${key}".`);
    return { success: false, error: "validation" };
  }

  let previousValue: string | null;
  try {
    previousValue = storage.getItem(key);
  } catch (error) {
    console.warn(`[storage] Failed to inspect "${key}" before writing. The value was not changed.`, error);
    return { success: false, error: "read" };
  }

  const rollback = (): boolean => {
    try {
      if (previousValue === null) storage.removeItem(key);
      else storage.setItem(key, previousValue);
      return storage.getItem(key) === previousValue;
    } catch (rollbackError) {
      console.error(`[storage] Failed to roll back "${key}" after an unsuccessful write.`, rollbackError);
      return false;
    }
  };

  try {
    storage.setItem(key, value);
  } catch (error) {
    console.warn(`[storage] Failed to write "${key}".`, error);
    let unchanged = false;
    try {
      unchanged = storage.getItem(key) === previousValue;
    } catch (readError) {
      console.warn(`[storage] Failed to inspect "${key}" after the write error.`, readError);
    }
    if (!unchanged && !rollback()) {
      return { success: false, error: "rollback" };
    }
    return { success: false, error: isQuotaExceededError(error) ? "quota" : "write" };
  }

  try {
    if (storage.getItem(key) === value) return { success: true };
  } catch (error) {
    console.warn(`[storage] Failed to verify "${key}" after writing.`, error);
  }

  console.warn(`[storage] Write verification failed for "${key}". Restoring the previous value.`);
  if (!rollback()) {
    return { success: false, error: "rollback" };
  }
  return { success: false, error: "verification" };
}

export function writeJson<T>(key: string, value: T): StorageWriteResult {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      console.warn(`[storage] Refused to write non-serializable JSON to "${key}".`);
      return { success: false, error: "serialize" };
    }
    JSON.parse(serialized);
    return writeString(key, serialized);
  } catch (error) {
    console.warn(`[storage] Failed to serialize "${key}".`, error);
    return { success: false, error: "serialize" };
  }
}

export function remove(key: string): StorageWriteResult {
  const storage = getStorage();
  if (!storage) return { success: false, error: "unavailable" };

  let previousValue: string | null;
  try {
    previousValue = storage.getItem(key);
  } catch (error) {
    console.warn(`[storage] Failed to inspect "${key}" before removal. The value was not changed.`, error);
    return { success: false, error: "read" };
  }

  try {
    storage.removeItem(key);
  } catch (error) {
    console.warn(`[storage] Failed to remove "${key}".`, error);
    try {
      if (storage.getItem(key) !== previousValue && previousValue !== null) {
        storage.setItem(key, previousValue);
      }
    } catch (rollbackError) {
      console.error(`[storage] Failed to roll back removal of "${key}".`, rollbackError);
      return { success: false, error: "rollback" };
    }
    return { success: false, error: "remove" };
  }

  try {
    if (storage.getItem(key) === null) return { success: true };
  } catch (error) {
    console.warn(`[storage] Failed to verify removal of "${key}".`, error);
  }
  if (previousValue !== null) {
    try {
      storage.setItem(key, previousValue);
      if (storage.getItem(key) !== previousValue) return { success: false, error: "rollback" };
    } catch (rollbackError) {
      console.error(`[storage] Failed to restore "${key}" after removal verification failed.`, rollbackError);
      return { success: false, error: "rollback" };
    }
  }
  return { success: false, error: "verification" };
}

export function exists(key: string): boolean {
  return readString(key).found;
}
