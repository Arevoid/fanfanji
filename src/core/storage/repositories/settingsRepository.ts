import type { UserSettings, UserSettingsUpdate } from "../../../types";
import { findPrimaryIdentityForIdentity } from "../../../domain/relationship/characterRelationship";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readingAssetDb } from "../readingAssetDb";

type SettingsRecord = Record<string, unknown>;

/**
 * A deliberately small IndexedDB fallback for the fields that are needed to
 * keep profile edits usable when the legacy monolithic phone_settings value
 * has reached localStorage quota. It never contains API credentials or other
 * settings, and it is only written after the normal settings write fails.
 */
export interface SettingsDurableOverlay {
  version: 1;
  identities?: UserSettings["identities"];
  activeIdentityId?: string;
  name?: string;
  avatar?: string;
  signature?: string;
  bio?: string;
  chatEnterKeyNewline?: boolean;
}

const SETTINGS_DURABLE_OVERLAY_KEY = "user-settings-durable-overlay-v1";
let settingsOverlayWriteChain: Promise<void> = Promise.resolve();
let settingsOverlayHydrated = false;
const SETTINGS_OVERLAY_FIELDS = new Set([
  "identities",
  "activeIdentityId",
  "name",
  "avatar",
  "signature",
  "bio",
  "chatEnterKeyNewline",
]);

const buildSettingsDurableOverlay = (settings: UserSettings): SettingsDurableOverlay => ({
  version: 1,
  identities: settings.identities,
  activeIdentityId: settings.activeIdentityId,
  name: settings.name,
  avatar: settings.avatar,
  signature: settings.signature,
  bio: settings.bio,
  chatEnterKeyNewline: settings.chatEnterKeyNewline,
});

const hasOnlyDurableOverlayChanges = (settings: UserSettings): boolean => {
  const previous = readJson<unknown>(storageKeys.settings, null);
  if (!previous.found || !previous.valid || !isRecord(previous.value)) return false;
  const currentRecord = settings as unknown as SettingsRecord;
  const previousRecord = previous.value;
  const keys = new Set([...Object.keys(currentRecord), ...Object.keys(previousRecord)]);
  return [...keys].every((key) => SETTINGS_OVERLAY_FIELDS.has(key)
    || JSON.stringify(currentRecord[key]) === JSON.stringify(previousRecord[key]));
};

const enqueueSettingsOverlayWrite = (operation: () => Promise<void>): void => {
  settingsOverlayWriteChain = settingsOverlayWriteChain
    .catch(() => undefined)
    .then(operation)
    .catch((error) => {
      // Monitoring/settings fallback must never turn a local save into a UI
      // error. The original localStorage value remains untouched on failure.
      console.warn("[settings] Durable profile fallback was unavailable.", error);
    });
};

/** Loads the quota fallback written by saveSettings, if IndexedDB is usable. */
export async function loadSettingsDurableOverlay(): Promise<SettingsDurableOverlay | null> {
  if (typeof indexedDB === "undefined") return null;
  await settingsOverlayWriteChain;
  try {
    const value = await readingAssetDb.loadMetadataValue<SettingsDurableOverlay>(SETTINGS_DURABLE_OVERLAY_KEY);
    settingsOverlayHydrated = true;
    if (!value || value.version !== 1 || typeof value !== "object") return null;
    return value;
  } catch (error) {
    console.warn("[settings] Failed to load durable profile fallback.", error);
    return null;
  }
}

/** Applies only the small profile/keyboard overlay; all other settings stay unchanged. */
export function applySettingsDurableOverlay(settings: UserSettings, overlay: SettingsDurableOverlay): UserSettings {
  if (overlay.version !== 1) return settings;
  return {
    ...settings,
    ...(overlay.identities ? { identities: overlay.identities } : {}),
    ...(overlay.activeIdentityId ? { activeIdentityId: overlay.activeIdentityId } : {}),
    ...(overlay.name !== undefined ? { name: overlay.name } : {}),
    ...(overlay.avatar !== undefined ? { avatar: overlay.avatar } : {}),
    ...(overlay.signature !== undefined ? { signature: overlay.signature } : {}),
    ...(overlay.bio !== undefined ? { bio: overlay.bio } : {}),
    ...(overlay.chatEnterKeyNewline !== undefined ? { chatEnterKeyNewline: overlay.chatEnterKeyNewline } : {}),
  };
}

/** Removes a consumed fallback after the in-memory settings have been hydrated. */
export async function clearSettingsDurableOverlay(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    enqueueSettingsOverlayWrite(async () => {
      try {
        await readingAssetDb.deleteMetadataValue(SETTINGS_DURABLE_OVERLAY_KEY);
      } finally {
        resolve();
      }
    });
  });
}

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
    && a.kind === b.kind
    && a.rootIdentityId === b.rootIdentityId
    && a.parentIdentityId === b.parentIdentityId
    && a.archived === b.archived
    && a.sortOrder === b.sortOrder;
}

// Version 2 makes active-identity recovery archive-aware. It is a
// non-destructive migration: archived records and all of their IDs remain in
// place; only the active pointer is moved when it points at an archived record
// and another usable identity exists.
const IDENTITY_DATA_VERSION = 2;

/** Repairs legacy identity records without guessing or rewriting user profile text. */
export function normalizeIdentitySettings(settings: UserSettings): { settings: UserSettings; changed: boolean } {
  const identities = settings.identities;
  if (!identities || identities.length === 0) {
    const legacyPrimary = {
      id: "identity-1",
      name: settings.name || "",
      avatar: settings.avatar || "",
      signature: settings.signature || "",
      bio: settings.bio || "",
      kind: "primary" as const,
      rootIdentityId: "identity-1",
      sortOrder: 0,
    };
    return {
      settings: {
        ...settings,
        identities: [legacyPrimary],
        identityDataVersion: Math.max(IDENTITY_DATA_VERSION, Number(settings.identityDataVersion) || 0),
        activeIdentityId: "identity-1",
      },
      changed: true,
    };
  }

  const usedIds = new Set<string>();
  let changed = (Number(settings.identityDataVersion) || 0) < IDENTITY_DATA_VERSION;
  const idNormalizedIdentities = identities.map((identity, index) => {
    let id = typeof identity.id === "string" && identity.id.trim() ? identity.id : `identity-${index + 1}`;
    if (usedIds.has(id)) {
      let repairIndex = index + 1;
      do {
        id = `identity-repaired-${repairIndex}`;
        repairIndex += 1;
      } while (usedIds.has(id));
    }
    usedIds.add(id);
    return id === identity.id ? identity : { ...identity, id };
  });

  const identityIds = new Set(idNormalizedIdentities.map((identity) => identity.id));
  const rootById = new Map<string, string>();
  const resolveRoot = (identityId: string, seen = new Set<string>()): string => {
    const cached = rootById.get(identityId);
    if (cached) return cached;
    if (seen.has(identityId)) return identityId;
    seen.add(identityId);
    const identity = idNormalizedIdentities.find((item) => item.id === identityId);
    if (!identity || identity.kind !== "alias") {
      rootById.set(identityId, identityId);
      return identityId;
    }
    const parentId = identity.parentIdentityId && identityIds.has(identity.parentIdentityId)
      ? identity.parentIdentityId
      : identityId;
    const rootId = parentId === identityId ? identityId : resolveRoot(parentId, seen);
    rootById.set(identityId, rootId);
    return rootId;
  };

  const normalizedIdentities = idNormalizedIdentities.map((identity, index) => {
    // Unknown legacy kinds are treated as primary rather than hidden from the
    // main persona list. Only the explicit alias marker keeps its old meaning.
    const kind = identity.kind === "alias" ? "alias" : "primary";
    // Legacy aliases without an explicit parent remain their own root. This is
    // deliberately conservative: it preserves boundaries instead of guessing
    // ownership from a shared name, avatar, or profile text.
    const parentIdentityId = kind === "alias"
      && identity.parentIdentityId
      && identityIds.has(identity.parentIdentityId)
      && identity.parentIdentityId !== identity.id
      ? identity.parentIdentityId
      : undefined;
    const normalized: typeof identity = {
      ...identity,
      kind,
      rootIdentityId: resolveRoot(identity.id),
      ...(parentIdentityId ? { parentIdentityId } : { parentIdentityId: undefined }),
      sortOrder: Number.isFinite(identity.sortOrder) ? identity.sortOrder : index,
    };
    if (!sameIdentity(normalized, identity)) changed = true;
    return normalized;
  });

  const requestedActiveId = settings.activeIdentityId || "identity-1";
  const activeIdentity = normalizedIdentities.find((identity) => identity.id === requestedActiveId && !identity.archived)
    || normalizedIdentities.find((identity) => identity.id === "identity-1" && !identity.archived)
    || normalizedIdentities.find((identity) => !identity.archived)
    // If an imported/legacy backup archived every identity, preserve the
    // current pointer rather than silently unarchiving or deleting anything.
    || normalizedIdentities.find((identity) => identity.id === requestedActiveId)
    || normalizedIdentities[0];
  const primaryIdentity = findPrimaryIdentityForIdentity(activeIdentity.id, normalizedIdentities) || activeIdentity;
  if (activeIdentity.id !== settings.activeIdentityId
    || settings.name !== primaryIdentity.name
    || settings.avatar !== primaryIdentity.avatar
    || settings.signature !== primaryIdentity.signature
    || settings.bio !== primaryIdentity.bio) {
    changed = true;
  }

  return {
    settings: {
      ...settings,
      identities: normalizedIdentities,
      identityDataVersion: Math.max(IDENTITY_DATA_VERSION, Number(settings.identityDataVersion) || 0),
      activeIdentityId: activeIdentity.id,
      // Legacy top-level profile fields represent the selected主人设. They
      // must remain stable when a child alias becomes the active chat identity.
      name: primaryIdentity.name,
      avatar: primaryIdentity.avatar,
      signature: primaryIdentity.signature,
      bio: primaryIdentity.bio,
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
  const result = writeJson(storageKeys.settings, settings);
  if (result.success) {
    // Once startup has inspected the fallback, a later successful monolithic
    // save supersedes it. Queue the removal behind any pending overlay write.
    if (settingsOverlayHydrated && typeof indexedDB !== "undefined") {
      enqueueSettingsOverlayWrite(() => readingAssetDb.deleteMetadataValue(SETTINGS_DURABLE_OVERLAY_KEY));
    }
    return result;
  }

  // Keep the existing monolithic localStorage record as the source of truth
  // whenever it fits. When a large legacy settings object has exhausted that
  // quota, queue only profile/keyboard fields in the already-used IndexedDB
  // metadata store so an avatar or Enter-mode edit is not silently lost.
  if ((result.error === "quota" || result.error === "unavailable")
    && typeof indexedDB !== "undefined"
    && hasOnlyDurableOverlayChanges(settings)) {
    enqueueSettingsOverlayWrite(() => readingAssetDb.saveMetadataValue(
      SETTINGS_DURABLE_OVERLAY_KEY,
      buildSettingsDurableOverlay(settings),
    ));
    return { success: true };
  }
  return result;
}

export function resolveSettingsUpdate(previous: UserSettings, update: UserSettingsUpdate): UserSettings {
  return typeof update === "function" ? update(previous) : update;
}
