import type { UserSettings } from "../../../types";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

type SettingsRecord = Record<string, unknown>;

function isRecord(value: unknown): value is SettingsRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeSettings(defaults: SettingsRecord, saved: SettingsRecord): SettingsRecord {
  const merged: SettingsRecord = { ...defaults, ...saved };

  for (const [key, defaultValue] of Object.entries(defaults)) {
    const savedValue = saved[key];
    if (isRecord(defaultValue) && isRecord(savedValue)) {
      merged[key] = mergeSettings(defaultValue, savedValue);
    }
  }

  return merged;
}

export function loadSettings(defaultSettings: UserSettings): StorageResult<UserSettings> {
  const result = readJson<unknown>(storageKeys.settings, defaultSettings);
  if (!result.found || !result.valid) {
    return { ...result, value: defaultSettings };
  }

  if (!isRecord(result.value)) {
    console.warn("[storage] Invalid settings shape. The original value was left untouched.");
    return { value: defaultSettings, found: true, valid: false, error: "parse" };
  }

  return {
    value: mergeSettings(defaultSettings as unknown as SettingsRecord, result.value) as unknown as UserSettings,
    found: true,
    valid: true,
  };
}

export function saveSettings(settings: UserSettings): StorageWriteResult {
  return writeJson(storageKeys.settings, settings);
}
