import { storageKeys } from "../../core/storage/storageKeys";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  sanitizeAppearanceSettings,
  type AppearanceSettings,
} from "./theme";

export const APPEARANCE_SETTINGS_CHANGED = "appearance-settings-changed";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface AppearanceEventTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  dispatchEvent(event: Event): boolean;
}

function getStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadAppearanceSettings(storage: StorageLike | null = getStorage()): AppearanceSettings {
  if (!storage) return { ...DEFAULT_APPEARANCE_SETTINGS };
  try {
    const raw = storage.getItem(storageKeys.appearanceSettings);
    return raw ? sanitizeAppearanceSettings(JSON.parse(raw)) : { ...DEFAULT_APPEARANCE_SETTINGS };
  } catch {
    return { ...DEFAULT_APPEARANCE_SETTINGS };
  }
}

export function notifyAppearanceSettingsChanged(target: AppearanceEventTarget | null = typeof window === "undefined" ? null : window): void {
  target?.dispatchEvent(new Event(APPEARANCE_SETTINGS_CHANGED));
}

/** Returns false when storage is unavailable or the normalized value was already persisted. */
export function saveAppearanceSettings(
  value: AppearanceSettings,
  storage: StorageLike | null = getStorage(),
  target: AppearanceEventTarget | null = typeof window === "undefined" ? null : window,
): boolean {
  if (!storage) return false;
  const normalized = sanitizeAppearanceSettings(value);
  const serialized = JSON.stringify(normalized);
  try {
    if (storage.getItem(storageKeys.appearanceSettings) === serialized) return false;
    storage.setItem(storageKeys.appearanceSettings, serialized);
    notifyAppearanceSettingsChanged(target);
    return true;
  } catch {
    return false;
  }
}

export function subscribeAppearanceSettings(
  listener: (settings: AppearanceSettings) => void,
  target: AppearanceEventTarget | null = typeof window === "undefined" ? null : window,
  storage: StorageLike | null = getStorage(),
): () => void {
  if (!target) return () => undefined;
  const notify = () => listener(loadAppearanceSettings(storage));
  const onStorage = (event: Event) => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.key === storageKeys.appearanceSettings) notify();
  };
  target.addEventListener(APPEARANCE_SETTINGS_CHANGED, notify);
  target.addEventListener("storage", onStorage);
  return () => {
    target.removeEventListener(APPEARANCE_SETTINGS_CHANGED, notify);
    target.removeEventListener("storage", onStorage);
  };
}
