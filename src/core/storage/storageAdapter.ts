import type { StorageResult, StorageWriteResult } from "./storageTypes";

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

  try {
    storage.setItem(key, value);
    return { success: true };
  } catch (error) {
    console.warn(`[storage] Failed to write "${key}".`, error);
    return { success: false, error: "write" };
  }
}

export function writeJson<T>(key: string, value: T): StorageWriteResult {
  try {
    return writeString(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[storage] Failed to serialize "${key}".`, error);
    return { success: false, error: "write" };
  }
}

export function remove(key: string): StorageWriteResult {
  const storage = getStorage();
  if (!storage) return { success: false, error: "unavailable" };

  try {
    storage.removeItem(key);
    return { success: true };
  } catch (error) {
    console.warn(`[storage] Failed to remove "${key}".`, error);
    return { success: false, error: "remove" };
  }
}

export function exists(key: string): boolean {
  return readString(key).found;
}
