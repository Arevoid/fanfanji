import { readString } from "./storageAdapter";

export async function loadArraySafely<T>(preferredKey: string, fallbackKey?: string): Promise<T[]> {
  const keys = fallbackKey ? [preferredKey, fallbackKey] : [preferredKey];
  for (const key of keys) {
    const result = readString(key);
    if (!result.found || !result.valid || result.value === null) continue;
    try {
      const parsed = JSON.parse(result.value) as unknown;
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // Keep the original value untouched and continue to the legacy key.
    }
  }
  return [];
}

