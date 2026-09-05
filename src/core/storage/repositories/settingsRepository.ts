import type { UserSettings, UserSettingsUpdate } from "../../../types";
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

function sameIdentity(a: UserSettings["identities"] extends (infer T)[] | undefined ? T : never, b: UserSettings["identities"] extends (infer T)[] | undefined ? T : never): boolean {
  return a.id === b.id
    && a.name === b.name
    && a.avatar === b.avatar
    && a.signature === b.signature
    && a.bio === b.bio
    && a.kind === b.kind;
}

/** Repairs legacy identity records without guessing or rewriting user profile text. */
export function normalizeIdentitySettings(settings: UserSettings): { settings: UserSettings; changed: boolean } {
  const identities = settings.identities;
  if (!identities || identities.length === 0) {
    return { settings, changed: false };
  }

  const usedIds = new Set<string>();
  let changed = false;
  const normalizedIdentities = identities.map((identity, index) => {
    let id = typeof identity.id === "string" && identity.id.trim() ? identity.id : `identity-${index + 1}`;
    if (usedIds.has(id)) {
      let repairIndex = index + 1;
      do {
        id = `identity-repaired-${repairIndex}`;
        repairIndex += 1;
      } while (usedIds.has(id));
    }
    usedIds.add(id);
    const normalized = id === identity.id ? identity : { ...identity, id };
    if (!sameIdentity(normalized, identity)) changed = true;
    return normalized;
  });

  const requestedActiveId = settings.activeIdentityId || "identity-1";
  const activeIdentity = normalizedIdentities.find((identity) => identity.id === requestedActiveId)
    || normalizedIdentities.find((identity) => identity.id === "identity-1")
    || normalizedIdentities[0];
  if (activeIdentity.id !== settings.activeIdentityId
    || settings.name !== activeIdentity.name
    || settings.avatar !== activeIdentity.avatar
    || settings.signature !== activeIdentity.signature
    || settings.bio !== activeIdentity.bio) {
    changed = true;
  }

  return {
    settings: {
      ...settings,
      identities: normalizedIdentities,
      activeIdentityId: activeIdentity.id,
      name: activeIdentity.name,
      avatar: activeIdentity.avatar,
      signature: activeIdentity.signature,
      bio: activeIdentity.bio,
    },
    changed,
  };
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

  const mergedSettings = mergeSettings(defaultSettings as unknown as SettingsRecord, result.value) as unknown as UserSettings;
  const normalized = normalizeIdentitySettings(mergedSettings);
  if (normalized.changed) {
    const repaired = writeJson(storageKeys.settings, normalized.settings);
    if (!repaired.success) {
      console.warn("[storage] Could not persist repaired identity settings.");
    }
  }

  return {
    value: normalized.settings,
    found: true,
    valid: true,
  };
}

export function saveSettings(settings: UserSettings): StorageWriteResult {
  return writeJson(storageKeys.settings, settings);
}

export function resolveSettingsUpdate(previous: UserSettings, update: UserSettingsUpdate): UserSettings {
  return typeof update === "function" ? update(previous) : update;
}
