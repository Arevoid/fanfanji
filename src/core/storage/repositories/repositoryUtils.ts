import { readJson, writeJson } from "../storageAdapter";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export function readArray<T>(key: string, fallback: T[]): StorageResult<T[]> {
  const result = readJson<unknown>(key, fallback);
  if (!result.found || !result.valid) return { ...result, value: fallback };
  if (!Array.isArray(result.value)) {
    console.warn(`[storage] Expected an array in "${key}". The original value was left untouched.`);
    return { value: fallback, found: true, valid: false, error: "parse" };
  }
  return { value: result.value as T[], found: true, valid: true };
}

export function writeArray<T>(key: string, value: T[]): StorageWriteResult {
  if (!Array.isArray(value)) {
    console.warn(`[storage] Refused to write a non-array value to "${key}".`);
    return { success: false, error: "validation" };
  }
  return writeJson(key, value);
}

export function readObject<T extends object>(key: string, fallback: T): StorageResult<T> {
  const result = readJson<unknown>(key, fallback);
  if (!result.found || !result.valid) return { ...result, value: fallback };
  if (typeof result.value !== "object" || result.value === null || Array.isArray(result.value)) {
    console.warn(`[storage] Expected an object in "${key}". The original value was left untouched.`);
    return { value: fallback, found: true, valid: false, error: "parse" };
  }
  return { value: result.value as T, found: true, valid: true };
}
