import { createId } from "../../id/createId";
import * as LZStringModule from "lz-string";
import { readArray, writeArray } from "./repositoryUtils";
import { characterPhoneDb } from "../characterPhoneDb";
import { storageKeys } from "../storageKeys";
import type { Character } from "../../../types";
import type { CharacterPhoneRecord } from "../../../domain/characterPhone/types";
import {
  readString,
  writeJson,
  writeString,
  remove as removeStoredValue,
} from "../storageAdapter";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

const LZString = ((LZStringModule as typeof LZStringModule & { default?: typeof LZStringModule }).default ?? LZStringModule) as typeof import("lz-string");
const CHARACTER_PHONE_COMPRESSED_PREFIX = "lz16:";

interface CharacterPhoneIndexEntry {
  id: string;
  ownerIdentityId: string;
  characterId: string;
}

let cachedPhones: CharacterPhoneRecord[] | null = null;
let metadataReady = false;
let indexedDbHydrated = false;
let initializationPromise: Promise<StorageResult<CharacterPhoneRecord[]>> | null = null;
let metadataWriteQueue: Promise<void> = Promise.resolve();
let metadataWriteError: StorageWriteResult | null = null;
const pendingCharacterPhoneRemovals = new Set<string>();

const clonePhones = (phones: CharacterPhoneRecord[]): CharacterPhoneRecord[] => typeof structuredClone === "function"
  ? structuredClone(phones)
  : JSON.parse(JSON.stringify(phones)) as CharacterPhoneRecord[];

const phoneScopeKey = (ownerIdentityId: string, characterId: string) => `${ownerIdentityId}\u0000${characterId}`;

const isIndexEntry = (value: unknown): value is CharacterPhoneIndexEntry => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<CharacterPhoneIndexEntry>;
  return typeof entry.id === "string"
    && typeof entry.ownerIdentityId === "string"
    && typeof entry.characterId === "string";
};

const readCharacterPhoneIndex = (): StorageResult<CharacterPhoneIndexEntry[]> => {
  const result = readArray<unknown>(storageKeys.characterPhonesIndexV2, []);
  if (!result.valid) return { ...result, value: [] };
  return {
    ...result,
    value: result.value.filter(isIndexEntry),
  };
};

const isCharacterPhoneRecord = (value: unknown): value is CharacterPhoneRecord =>
  typeof value === "object"
  && value !== null
  && typeof (value as Partial<CharacterPhoneRecord>).id === "string"
  && typeof (value as Partial<CharacterPhoneRecord>).ownerIdentityId === "string"
  && typeof (value as Partial<CharacterPhoneRecord>).characterId === "string";

const readV2CharacterPhone = (entry: CharacterPhoneIndexEntry): CharacterPhoneRecord | undefined => {
  const result = readString(storageKeys.characterPhoneV2(entry.id));
  if (!result.valid || !result.found || result.value === null) return undefined;
  try {
    const serialized = result.value.startsWith(CHARACTER_PHONE_COMPRESSED_PREFIX)
      ? LZString.decompressFromUTF16(result.value.slice(CHARACTER_PHONE_COMPRESSED_PREFIX.length))
      : result.value;
    if (!serialized) return undefined;
    const parsed: unknown = JSON.parse(serialized);
    return isCharacterPhoneRecord(parsed) ? normalizeCharacterPhoneRecord(parsed) : undefined;
  } catch {
    return undefined;
  }
};

const readLegacyCharacterPhones = () => readArray<CharacterPhoneRecord>(storageKeys.characterPhones, []);

function loadLegacyStorage(): StorageResult<CharacterPhoneRecord[]> {
  const legacy = readLegacyCharacterPhones();
  const index = readCharacterPhoneIndex();
  if (!legacy.valid) return { ...legacy, value: [] };
  if (!index.valid) return { ...index, value: [] };

  const merged = new Map<string, CharacterPhoneRecord>();
  legacy.value
    .filter(isCharacterPhoneRecord)
    .map(normalizeCharacterPhoneRecord)
    .forEach((phone) => merged.set(phoneScopeKey(phone.ownerIdentityId, phone.characterId), phone));
  index.value.forEach((entry) => {
    const phone = readV2CharacterPhone(entry);
    if (phone) merged.set(phoneScopeKey(phone.ownerIdentityId, phone.characterId), phone);
  });

  return {
    value: [...merged.values()],
    found: legacy.found || index.found,
    valid: true,
  };
}

function load(): StorageResult<CharacterPhoneRecord[]> {
  if (metadataReady && cachedPhones) return { value: cachedPhones, found: true, valid: true };
  return loadLegacyStorage();
}

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function normalizePhoneCollection(phones: CharacterPhoneRecord[]): CharacterPhoneRecord[] {
  const byScope = new Map<string, CharacterPhoneRecord>();
  phones
    .filter(isCharacterPhoneRecord)
    .map(normalizeCharacterPhoneRecord)
    .forEach((phone) => byScope.set(phoneScopeKey(phone.ownerIdentityId, phone.characterId), phone));
  return [...byScope.values()];
}

function mergePhoneCollections(
  indexedPhones: CharacterPhoneRecord[],
  localPhones: CharacterPhoneRecord[],
): CharacterPhoneRecord[] {
  const merged = new Map<string, CharacterPhoneRecord>();
  indexedPhones.forEach((phone) => merged.set(phoneScopeKey(phone.ownerIdentityId, phone.characterId), phone));
  localPhones.forEach((phone) => {
    const key = phoneScopeKey(phone.ownerIdentityId, phone.characterId);
    const previous = merged.get(key);
    if (!previous || phone.updatedAt >= previous.updatedAt) merged.set(key, phone);
  });
  return [...merged.values()];
}

function notifyPhoneStorage(eventName: "ready" | "error", error?: unknown): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function" || typeof CustomEvent === "undefined") return;
  window.dispatchEvent(new CustomEvent(`character-phone-storage-${eventName}`, {
    detail: error ? { error: String(error) } : undefined,
  }));
}

function clearLegacyPhoneStorage(migratedPhones: readonly CharacterPhoneRecord[] = []): void {
  if (typeof window === "undefined") return;
  const migratedScopes = new Set(migratedPhones.map((phone) => phoneScopeKey(phone.ownerIdentityId, phone.characterId)));
  if (migratedScopes.size === 0) return;
  const index = readCharacterPhoneIndex();
  if (index.valid && index.found) {
    const removable = index.value.filter((entry) => {
      if (!migratedScopes.has(phoneScopeKey(entry.ownerIdentityId, entry.characterId))) return false;
      return Boolean(readV2CharacterPhone(entry));
    });
    removable.forEach((entry) => removeStoredValue(storageKeys.characterPhoneV2(entry.id)));
    const retained = index.value.filter((entry) => !removable.some((candidate) => candidate.id === entry.id));
    if (retained.length === 0) removeStoredValue(storageKeys.characterPhonesIndexV2);
    else if (retained.length !== index.value.length) writeJson(storageKeys.characterPhonesIndexV2, retained);
  }
  const legacy = readLegacyCharacterPhones();
  if (legacy.valid && legacy.found) {
    const retained = legacy.value.filter((item) => !isCharacterPhoneRecord(item)
      || !migratedScopes.has(phoneScopeKey(item.ownerIdentityId, item.characterId)));
    if (retained.length === 0) removeStoredValue(storageKeys.characterPhones);
    else if (retained.length !== legacy.value.length) writeArray(storageKeys.characterPhones, retained);
  }
}

function enqueueIndexedDbWrite(phones: CharacterPhoneRecord[]): void {
  const snapshot = clonePhones(phones);
  const next = metadataWriteQueue
    .catch(() => undefined)
    .then(async () => {
      // A save can happen before the asynchronous startup hydration finishes.
      // Read the existing database first in that case, otherwise replacing the
      // optimistic snapshot could erase phones that have not been loaded yet.
      let persistedSnapshot = snapshot;
      if (!indexedDbHydrated) {
        const existing = normalizePhoneCollection(await characterPhoneDb.loadAll());
        persistedSnapshot = mergePhoneCollections(existing, snapshot)
          .filter((phone) => !pendingCharacterPhoneRemovals.has(phone.characterId));
        if (cachedPhones) {
          cachedPhones = mergePhoneCollections(existing, cachedPhones)
            .filter((phone) => !pendingCharacterPhoneRemovals.has(phone.characterId));
        }
      }
      await characterPhoneDb.replaceAll(persistedSnapshot);
      indexedDbHydrated = true;
      clearLegacyPhoneStorage(persistedSnapshot);
    });
  metadataWriteError = null;
  const tracked = next.then(
    () => undefined,
    (error) => {
      const name = error && typeof error === "object" ? String((error as { name?: unknown }).name || "") : "";
      metadataWriteError = { success: false, error: name === "QuotaExceededError" ? "quota" : "write" };
      console.warn("[character-phone] Failed to persist records in IndexedDB.", error);
      notifyPhoneStorage("error", error);
      throw error;
    },
  );
  metadataWriteQueue = tracked.catch(() => undefined);
}

/**
 * Hydrate the dedicated IndexedDB store before a role phone is opened. The
 * migration is conservative: an IndexedDB snapshot wins only when it exists;
 * otherwise the complete legacy localStorage collection is copied first and
 * removed only after the transaction succeeds.
 */
export async function initializeCharacterPhoneRepository(): Promise<StorageResult<CharacterPhoneRecord[]>> {
  if (!canUseIndexedDb()) return loadLegacyStorage();
  if (metadataReady && indexedDbHydrated && cachedPhones) return { value: cachedPhones, found: true, valid: true };
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    try {
      const indexedPhones = normalizePhoneCollection(await characterPhoneDb.loadAll());
      indexedDbHydrated = true;
      const local = loadLegacyStorage();
      // A quota fallback may have hydrated an in-memory snapshot while this
      // IndexedDB read was in flight. Never replace that newer snapshot with
      // the older read result (or with an empty localStorage fallback).
      const localPhones = local.valid ? normalizePhoneCollection(local.value) : [];
      // Include an optimistic cache created by a phone opened while this read
      // was in flight. Merging by owner + character scope prevents one
      // identity's phone from replacing another identity's phone.
      const optimisticPhones = metadataReady && cachedPhones ? cachedPhones : [];
      if (!local.valid && indexedPhones.length === 0 && optimisticPhones.length === 0) return local;
      const pendingRemovals = new Set(pendingCharacterPhoneRemovals);
      cachedPhones = mergePhoneCollections(
        mergePhoneCollections(indexedPhones, localPhones),
        optimisticPhones,
      ).filter((phone) => !pendingRemovals.has(phone.characterId));
      metadataReady = true;
      // Replace even an empty snapshot: a deletion tombstone may have removed
      // the last phone from IndexedDB and must not leave it behind there.
      await characterPhoneDb.replaceAll(clonePhones(cachedPhones));
      pendingRemovals.forEach((characterId) => pendingCharacterPhoneRemovals.delete(characterId));
      if (cachedPhones.length > 0) {
        clearLegacyPhoneStorage(cachedPhones);
      }
      notifyPhoneStorage("ready");
      return { value: cachedPhones, found: local.found || indexedPhones.length > 0, valid: true };
    } catch (error) {
      console.warn("[character-phone] IndexedDB initialization failed; using localStorage for this session.", error);
      metadataReady = false;
      const fallback = loadLegacyStorage();
      // IndexedDB is an optimization/escape hatch. If the legacy browser
      // storage is still readable, the phone remains persistable there and
      // should not display a false "save failed" banner.
      if (fallback.valid) notifyPhoneStorage("ready");
      else notifyPhoneStorage("error", error);
      return fallback;
    } finally {
      initializationPromise = null;
    }
  })();
  return initializationPromise;
}

export async function flushCharacterPhoneRepository(): Promise<StorageWriteResult> {
  if (!canUseIndexedDb()) return { success: true };
  try {
    await metadataWriteQueue;
    return metadataWriteError || { success: true };
  } catch (error) {
    const name = error && typeof error === "object" ? String((error as { name?: unknown }).name || "") : "";
    return { success: false, error: name === "QuotaExceededError" ? "quota" : "write" };
  }
}

const LEGACY_MUSIC_TITLES = new Set([
  "Night Mood",
  "Quiet City Lights",
  "Soft Rain",
  "First Light",
]);

export const CHARACTER_PHONE_DEFAULT_WALLPAPER =
  "linear-gradient(145deg, #eeeeec 0%, #fafaf9 48%, #e4e4e2 100%)";

const CHARACTER_PHONE_DEFAULT_PASSCODE = "8952";
const LEGACY_CHARACTER_PHONE_DEFAULT_PASSCODE = "0000";

export function normalizeCharacterPhonePasscode(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.padStart(4, "0").slice(-4);
}

const passcodeFor = (character: Character) => {
  void character;
  return CHARACTER_PHONE_DEFAULT_PASSCODE;
};

export function getCharacterPhone(
  ownerIdentityId: string,
  characterId: string,
): CharacterPhoneRecord | undefined {
  const phone = load().value.find(
    (phone) =>
      phone.ownerIdentityId === ownerIdentityId &&
      phone.characterId === characterId,
  );
  return phone ? normalizeCharacterPhoneRecord(phone) : undefined;
}

export function createCharacterPhone(
  ownerIdentityId: string,
  character: Character,
  now = Date.now(),
): CharacterPhoneRecord {
  const existing = getCharacterPhone(ownerIdentityId, character.id);
  if (existing) return existing;
  const phone: CharacterPhoneRecord = {
    id: createId("character-phone"),
    ownerIdentityId,
    characterId: character.id,
    passcode: normalizeCharacterPhonePasscode(passcodeFor(character)),
    failedAttempts: 0,
    createdAt: now,
    updatedAt: now,
    wallpaper: CHARACTER_PHONE_DEFAULT_WALLPAPER,
    appIcons: {},
    appOrder: ["chat", "browser", "schedule", "gallery", "diary", "notes", "music", "settings"],
    // A new role phone starts empty. Its visible contacts and conversations
    // are seeded by characterPhoneContent from this character's own context;
    // hard-coded demo messages here would leak across characters.
    messages: [],
    contacts: [],
    threadMessages: [],
    posts: [],
    browserHistory: [],
    diaryEntries: [],
    notes: [],
    todos: [],
    scheduleItems: [],
    phoneCalls: [],
    galleryItems: [],
    lifeEvents: [],
    activities: [],
  };
  saveCharacterPhone(phone);
  return phone;
}

function canonicalMusicId(phoneId: string, value: string): string {
  const prefix = `character-phone:${phoneId}:music:`;
  let sourceId = value;
  while (sourceId.startsWith(prefix)) sourceId = sourceId.slice(prefix.length);
  return `${prefix}${sourceId || "unknown"}`;
}

function normalizeMusicPersistence(phone: CharacterPhoneRecord): CharacterPhoneRecord {
  if (!phone.musicTracks?.length && !phone.musicPlaylists?.length) return phone;
  const musicTracks = phone.musicTracks?.map((track) => ({
    ...track,
    id: canonicalMusicId(phone.id, track.id),
  })).filter((track) => track.sourceTrackId || !LEGACY_MUSIC_TITLES.has(track.title));
  const musicTrackIds = new Set(musicTracks?.map((track) => track.id) ?? []);
  const musicPlaylists = phone.musicPlaylists?.map((playlist) => ({
    ...playlist,
    trackIds: playlist.trackIds
      .map((trackId) => canonicalMusicId(phone.id, trackId))
      .filter((trackId) => musicTrackIds.has(trackId)),
  })).filter((playlist) => playlist.trackIds.length > 0);
  const listeningHistory = phone.listeningHistory?.filter((record) => musicTrackIds.has(canonicalMusicId(phone.id, record.trackId)));
  return {
    ...phone,
    ...(musicTracks ? { musicTracks } : {}),
    ...(musicPlaylists ? { musicPlaylists } : {}),
    ...(listeningHistory ? { listeningHistory } : {}),
  };
}

const TEXT_IMAGE_DATA_URL_PATTERN = /^data:image\/svg\+xml(?:;[^,]*)?,/i;

/**
 * Generated/camera text images are deterministic SVGs built from caption and
 * title. Keep only a marker in localStorage and recreate the SVG at render
 * time; real uploaded photos continue to live in IndexedDB via imageAssetId.
 */
function normalizeGalleryPersistence(items: CharacterPhoneRecord["galleryItems"]): CharacterPhoneRecord["galleryItems"] {
  return items.map((item) => {
    if (!item.dataUrl || item.imageAssetId || !TEXT_IMAGE_DATA_URL_PATTERN.test(item.dataUrl)) return item;
    return {
      ...item,
      dataUrl: undefined,
      textImageForId: item.textImageForId || item.id,
    };
  });
}

function normalizeCharacterPhoneRecord(phone: CharacterPhoneRecord): CharacterPhoneRecord {
  const normalizedPasscode = normalizeCharacterPhonePasscode(phone.passcode);
  return normalizeMusicPersistence({
    ...phone,
    // Phones created before the default changed used 0000 and had no custom
    // password UI, so migrate that legacy default when the record is opened.
    passcode: normalizedPasscode === LEGACY_CHARACTER_PHONE_DEFAULT_PASSCODE
      ? CHARACTER_PHONE_DEFAULT_PASSCODE
      : normalizedPasscode,
    appIcons: phone.appIcons ?? {},
    appOrder: phone.appOrder ?? ["chat", "browser", "schedule", "gallery", "diary", "notes", "music", "settings"],
    messages: phone.messages ?? [],
    contacts: phone.contacts ?? [],
    threadMessages: phone.threadMessages ?? [],
    posts: phone.posts ?? [],
    browserHistory: phone.browserHistory ?? [],
    diaryEntries: phone.diaryEntries ?? [],
    notes: phone.notes ?? [],
    todos: phone.todos ?? [],
    scheduleItems: phone.scheduleItems ?? [],
    phoneCalls: phone.phoneCalls ?? [],
    galleryItems: normalizeGalleryPersistence(phone.galleryItems ?? []),
    musicTracks: phone.musicTracks ?? [],
    listeningHistory: phone.listeningHistory ?? [],
    musicPlaylists: phone.musicPlaylists ?? [],
    actionLog: (phone.actionLog ?? []).slice(-300),
    lifeEvents: (phone.lifeEvents ?? []).slice(-200),
    activities: (phone.activities ?? []).slice(-300),
  });
}

function restoreStoredValue(key: string, previousValue: string | null): StorageWriteResult {
  return previousValue === null
    ? removeStoredValue(key)
    : writeString(key, previousValue);
}

function saveLegacyWithoutPhone(
  legacyPhones: CharacterPhoneRecord[],
  ownerIdentityId: string,
  characterId: string,
): StorageWriteResult {
  const remaining = legacyPhones.filter((item) =>
    phoneScopeKey(item.ownerIdentityId, item.characterId) !== phoneScopeKey(ownerIdentityId, characterId));
  return remaining.length > 0
    ? writeArray(storageKeys.characterPhones, remaining)
    : removeStoredValue(storageKeys.characterPhones);
}

function serializeCharacterPhone(phone: CharacterPhoneRecord): string | null {
  try {
    const serialized = JSON.stringify(phone);
    if (typeof serialized !== "string") return null;
    const compressed = LZString.compressToUTF16(serialized);
    // Very small records can be larger after compression. Keep the plain JSON
    // representation in that case so old browsers never pay an overhead.
    return compressed.length + CHARACTER_PHONE_COMPRESSED_PREFIX.length < serialized.length
      ? `${CHARACTER_PHONE_COMPRESSED_PREFIX}${compressed}`
      : serialized;
  } catch {
    return null;
  }
}

/**
 * A previous import or interrupted v2 migration can leave a phone record that
 * is no longer referenced by the v2 index. Such records are unreachable by
 * the app but still consume localStorage quota. Only remove keys that are
 * provably unindexed and only when a valid, existing index is available; a
 * missing/corrupt index is left untouched so recovery remains possible.
 */
function removeUnindexedV2PhoneRecords(index: StorageResult<CharacterPhoneIndexEntry[]>): number {
  if (typeof window === "undefined" || !index.valid || !index.found) return 0;
  const referenced = new Set(index.value.map((entry) => storageKeys.characterPhoneV2(entry.id)));
  const storage = window.localStorage;
  const prefix = "phone_character_phone_v2_";
  const orphaned: string[] = [];
  for (let position = 0; position < storage.length; position += 1) {
    const key = storage.key(position);
    if (key && key.startsWith(prefix) && !referenced.has(key)) orphaned.push(key);
  }
  orphaned.forEach((key) => removeStoredValue(key));
  return orphaned.length;
}

function saveCharacterPhoneToIndexedDb(phone: CharacterPhoneRecord): StorageWriteResult {
  const normalizedPhone = normalizeCharacterPhoneRecord(phone);
  const source = metadataReady && cachedPhones
    ? cachedPhones
    : normalizePhoneCollection(loadLegacyStorage().value);
  const scope = phoneScopeKey(normalizedPhone.ownerIdentityId, normalizedPhone.characterId);
  cachedPhones = [
    ...source.filter((candidate) => phoneScopeKey(candidate.ownerIdentityId, candidate.characterId) !== scope),
    normalizedPhone,
  ];
  metadataReady = true;
  enqueueIndexedDbWrite(cachedPhones);
  return { success: true };
}

/**
 * Persist only the changed phone. The previous v1 implementation serialized
 * every character phone into one localStorage value on every mutation. A
 * single edit could therefore fail merely because an unrelated phone made
 * that one value too large. v2 stores one record per phone and keeps a tiny
 * index for enumeration. Legacy records are removed one scope at a time after
 * the new record is safely written.
 */
export function saveCharacterPhone(phone: CharacterPhoneRecord): StorageWriteResult {
  const normalizedPhone = normalizeCharacterPhoneRecord(phone);
  if (canUseIndexedDb() && metadataReady && cachedPhones) {
    return saveCharacterPhoneToIndexedDb(normalizedPhone);
  }
  const legacy = readLegacyCharacterPhones();
  const index = readCharacterPhoneIndex();
  if (!legacy.valid) {
    return canUseIndexedDb()
      ? saveCharacterPhoneToIndexedDb(normalizedPhone)
      : { success: false, error: legacy.error ?? "parse" };
  }
  if (!index.valid) {
    return canUseIndexedDb()
      ? saveCharacterPhoneToIndexedDb(normalizedPhone)
      : { success: false, error: index.error ?? "parse" };
  }

  const scope = phoneScopeKey(normalizedPhone.ownerIdentityId, normalizedPhone.characterId);
  const legacyMatch = legacy.value.find((item) =>
    isCharacterPhoneRecord(item)
    && phoneScopeKey(item.ownerIdentityId, item.characterId) === scope);
  const previousLegacyValue = readString(storageKeys.characterPhones);

  // Free the old copy before creating the new per-phone value. This keeps the
  // migration viable even when the old aggregate value was close to quota.
  if (legacyMatch) {
    const legacyWrite = saveLegacyWithoutPhone(
      legacy.value.filter(isCharacterPhoneRecord),
      normalizedPhone.ownerIdentityId,
      normalizedPhone.characterId,
    );
    if (!legacyWrite.success) {
      return legacyWrite.error === "quota" && canUseIndexedDb()
        ? saveCharacterPhoneToIndexedDb(normalizedPhone)
        : legacyWrite;
    }
  }

  const recordKey = storageKeys.characterPhoneV2(normalizedPhone.id);
  const previousRecordValue = readString(recordKey);
  const serializedPhone = serializeCharacterPhone(normalizedPhone);
  if (serializedPhone === null) {
    if (legacyMatch && previousLegacyValue.valid) restoreStoredValue(storageKeys.characterPhones, previousLegacyValue.value);
    return { success: false, error: "serialize" };
  }
  let recordWrite = writeString(recordKey, serializedPhone);
  if (!recordWrite.success && recordWrite.error === "quota") {
    // Reclaim only unreachable v2 records before reporting a real quota
    // failure. Formal records referenced by the index are never deleted.
    if (removeUnindexedV2PhoneRecords(index) > 0) {
      recordWrite = writeString(recordKey, serializedPhone);
    }
  }
  if (!recordWrite.success) {
    if (legacyMatch && previousLegacyValue.valid) restoreStoredValue(storageKeys.characterPhones, previousLegacyValue.value);
    // IndexedDB has a separate quota from localStorage in supported browsers.
    // Keep the complete record (including older conversations) instead of
    // dropping data merely because the legacy storage bucket is full.
    if (recordWrite.error === "quota" && canUseIndexedDb()) {
      return saveCharacterPhoneToIndexedDb(normalizedPhone);
    }
    return recordWrite;
  }

  const previousIndexValue = readString(storageKeys.characterPhonesIndexV2);
  const nextIndex: CharacterPhoneIndexEntry[] = [
    ...index.value.filter((entry) =>
      entry.id !== normalizedPhone.id
      && phoneScopeKey(entry.ownerIdentityId, entry.characterId) !== scope),
    {
      id: normalizedPhone.id,
      ownerIdentityId: normalizedPhone.ownerIdentityId,
      characterId: normalizedPhone.characterId,
    },
  ];
  const indexWrite = writeJson(storageKeys.characterPhonesIndexV2, nextIndex);
  if (!indexWrite.success) {
    const recordRollback = restoreStoredValue(recordKey, previousRecordValue.valid && previousRecordValue.found
      ? previousRecordValue.value
      : null);
    if (legacyMatch && previousLegacyValue.valid) restoreStoredValue(storageKeys.characterPhones, previousLegacyValue.value);
    if (!recordRollback.success) return { success: false, error: "rollback" };
    if (indexWrite.error === "quota" && canUseIndexedDb()) {
      return saveCharacterPhoneToIndexedDb(normalizedPhone);
    }
    return indexWrite;
  }

  // A previous v2 record for the same scope can have a different id after an
  // import. It is no longer reachable from the index, so remove the orphan.
  index.value
    .filter((entry) => entry.id !== normalizedPhone.id && phoneScopeKey(entry.ownerIdentityId, entry.characterId) === scope)
    .forEach((entry) => { removeStoredValue(storageKeys.characterPhoneV2(entry.id)); });

  // If the old aggregate is now empty, remove it completely. Otherwise it is
  // still a read-only migration source for phones that have not been opened.
  if (legacyMatch && legacy.value.filter(isCharacterPhoneRecord).length === 1) {
    // saveLegacyWithoutPhone already removed the key; this branch documents
    // that no legacy aggregate remains after the final phone is migrated.
    removeStoredValue(storageKeys.characterPhones);
  }
  return { success: true };
}

export interface CharacterPhoneStorageUsage {
  backend: "indexeddb" | "localStorage";
  currentPhoneBytes: number;
  totalPhoneBytes: number;
  legacyBytes: number;
  v2Bytes: number;
  indexBytes: number;
  legacyRecordCount: number;
  v2RecordCount: number;
}

export interface CharacterPhoneStorageMigrationResult {
  migratedCount: number;
  remainingLegacyCount: number;
  result: StorageWriteResult;
}

/**
 * Finish migrating the old aggregate record without requiring a large
 * temporary duplicate. Each phone is moved independently; if a later move
 * runs out of space, already-migrated phones remain readable from v2 and the
 * untouched phones remain in v1 for the next attempt.
 */
export function migrateLegacyCharacterPhones(): CharacterPhoneStorageMigrationResult {
  if (canUseIndexedDb() && metadataReady && cachedPhones) {
    return { migratedCount: 0, remainingLegacyCount: 0, result: { success: true } };
  }
  const legacy = readLegacyCharacterPhones();
  if (!legacy.valid) {
    return {
      migratedCount: 0,
      remainingLegacyCount: 0,
      result: { success: false, error: legacy.error ?? "parse" },
    };
  }

  const legacyRecords = [...legacy.value
    .filter(isCharacterPhoneRecord)
    .reduce((records, phone) => records.set(phoneScopeKey(phone.ownerIdentityId, phone.characterId), phone), new Map<string, CharacterPhoneRecord>())
    .values()];
  let migratedCount = 0;
  for (const phone of legacyRecords) {
    const result = saveCharacterPhone(phone);
    if (!result.success) {
      const remaining = readLegacyCharacterPhones();
      return {
        migratedCount,
        remainingLegacyCount: remaining.valid ? remaining.value.filter(isCharacterPhoneRecord).length : legacyRecords.length - migratedCount,
        result,
      };
    }
    migratedCount += 1;
  }
  return {
    migratedCount,
    remainingLegacyCount: 0,
    result: { success: true },
  };
}

const storageByteLength = (value: string): number => value.length * 2;

/**
 * Reports actual role-phone persistence separately from rebuildable caches.
 * During the IndexedDB migration the in-memory snapshot is used for the byte
 * estimate; binary gallery assets are handled by the existing media tools.
 */
export function getCharacterPhoneStorageUsage(
  ownerIdentityId?: string,
  characterId?: string,
): CharacterPhoneStorageUsage {
  if (canUseIndexedDb() && metadataReady && cachedPhones) {
    const indexedBytes = cachedPhones.reduce((total, phone) => total + storageByteLength(JSON.stringify(phone)), 0);
    const currentPhone = ownerIdentityId && characterId
      ? cachedPhones.find((phone) => phone.ownerIdentityId === ownerIdentityId && phone.characterId === characterId)
      : undefined;
    return {
      backend: "indexeddb",
      currentPhoneBytes: currentPhone ? storageByteLength(JSON.stringify(currentPhone)) : 0,
      totalPhoneBytes: indexedBytes,
      legacyBytes: 0,
      v2Bytes: 0,
      indexBytes: 0,
      legacyRecordCount: 0,
      v2RecordCount: cachedPhones.length,
    };
  }
  const legacyRaw = readString(storageKeys.characterPhones);
  const indexRaw = readString(storageKeys.characterPhonesIndexV2);
  const legacyBytes = legacyRaw.found && legacyRaw.value !== null
    ? storageByteLength(storageKeys.characterPhones) + storageByteLength(legacyRaw.value)
    : 0;
  const indexBytes = indexRaw.found && indexRaw.value !== null
    ? storageByteLength(storageKeys.characterPhonesIndexV2) + storageByteLength(indexRaw.value)
    : 0;
  const legacy = readLegacyCharacterPhones();
  const index = readCharacterPhoneIndex();
  const legacyRecords = legacy.valid ? legacy.value.filter(isCharacterPhoneRecord) : [];
  const matchingLegacy = ownerIdentityId && characterId
    ? legacyRecords.filter((phone) => phone.ownerIdentityId === ownerIdentityId && phone.characterId === characterId)
    : [];
  const v2Records = index.valid
    ? index.value.map((entry) => {
        const raw = readString(storageKeys.characterPhoneV2(entry.id));
        return { entry, raw };
      }).filter((item) => item.raw.found && item.raw.value !== null)
    : [];
  const v2Bytes = v2Records.reduce((total, item) =>
    total + storageByteLength(storageKeys.characterPhoneV2(item.entry.id)) + storageByteLength(item.raw.value || ""), 0);
  const matchingV2Bytes = ownerIdentityId && characterId
    ? v2Records
      .filter((item) => item.entry.ownerIdentityId === ownerIdentityId && item.entry.characterId === characterId)
      .reduce((total, item) => total + storageByteLength(storageKeys.characterPhoneV2(item.entry.id)) + storageByteLength(item.raw.value || ""), 0)
    : 0;
  const matchingLegacyBytes = matchingLegacy.reduce((total, phone) => total + storageByteLength(JSON.stringify(phone)), 0);
  return {
    backend: "localStorage",
    currentPhoneBytes: matchingV2Bytes + matchingLegacyBytes,
    totalPhoneBytes: legacyBytes + indexBytes + v2Bytes,
    legacyBytes,
    v2Bytes,
    indexBytes,
    legacyRecordCount: legacyRecords.length,
    v2RecordCount: v2Records.length,
  };
}

/**
 * Remove all generated and user-created records from one role phone while
 * preserving its identity, passcode, wallpaper, app icons, and app order.
 * Binary gallery assets are returned by the caller from the pre-clear record
 * so they can be removed from IndexedDB as well.
 */
export function clearCharacterPhoneData(
  phone: CharacterPhoneRecord,
  now = Date.now(),
): CharacterPhoneRecord {
  return normalizeCharacterPhoneRecord({
    ...phone,
    failedAttempts: 0,
    lockedUntil: undefined,
    updatedAt: now,
    lastOpenedAt: undefined,
    lastGeneratedAt: undefined,
    contentSeededAt: undefined,
    lastSyncedMessageId: undefined,
    lastSyncedMomentId: undefined,
    messages: [],
    contacts: [],
    threadMessages: [],
    posts: [],
    browserHistory: [],
    diaryEntries: [],
    notes: [],
    todos: [],
    scheduleItems: [],
    phoneCalls: [],
    galleryItems: [],
    musicTracks: [],
    listeningHistory: [],
    musicPlaylists: [],
    actionLog: [],
    lifeEvents: [],
    activities: [],
    awarenessLevel: undefined,
    awarenessUpdatedAt: undefined,
    phoneOpenCount: 0,
  });
}

export function removeCharacterPhonesByCharacterIds(characterIds: Iterable<string>): {
  result: StorageWriteResult;
  imageAssetIds: string[];
} {
  const ids = new Set(characterIds);
  if (canUseIndexedDb() && metadataReady && indexedDbHydrated && cachedPhones) {
    const removed = cachedPhones.filter((phone) => ids.has(phone.characterId));
    cachedPhones = cachedPhones.filter((phone) => !ids.has(phone.characterId));
    enqueueIndexedDbWrite(cachedPhones);
    return {
      result: { success: true },
      imageAssetIds: [...new Set(removed.flatMap((phone) => phone.galleryItems ?? [])
        .map((item) => item.imageAssetId)
        .filter((id): id is string => Boolean(id)))],
    };
  }
  // Deletion can race the app-start hydration. Keep a tombstone so the
  // asynchronous IndexedDB merge cannot resurrect a phone that was just
  // deleted from the character archive.
  if (canUseIndexedDb()) {
    ids.forEach((id) => pendingCharacterPhoneRemovals.add(id));
    void initializeCharacterPhoneRepository();
  }
  const legacy = readLegacyCharacterPhones();
  const index = readCharacterPhoneIndex();
  if (!legacy.valid || !index.valid) {
    return {
      result: { success: false, error: (!legacy.valid ? legacy.error : index.error) ?? "parse" },
      imageAssetIds: [],
    };
  }
  const loaded = load();
  const removed = loaded.value.filter((phone) => ids.has(phone.characterId));
  const previousLegacyValue = readString(storageKeys.characterPhones);
  const retainedLegacy = legacy.value.filter((phone) => isCharacterPhoneRecord(phone) && !ids.has(phone.characterId));
  const legacyChanged = retainedLegacy.length !== legacy.value.filter(isCharacterPhoneRecord).length;
  const legacyResult = legacyChanged
    ? retainedLegacy.length > 0
      ? writeArray(storageKeys.characterPhones, retainedLegacy)
      : removeStoredValue(storageKeys.characterPhones)
    : { success: true as const };
  if (!legacyResult.success) {
    return { result: legacyResult, imageAssetIds: [] };
  }

  const removedEntries = index.value.filter((entry) => ids.has(entry.characterId));
  const retainedIndex = index.value.filter((entry) => !ids.has(entry.characterId));
  const previousIndexValue = readString(storageKeys.characterPhonesIndexV2);
  const indexResult = removedEntries.length > 0
    ? writeJson(storageKeys.characterPhonesIndexV2, retainedIndex)
    : { success: true as const };
  if (!indexResult.success) {
    if (legacyChanged && previousLegacyValue.valid && previousLegacyValue.value !== null) {
      restoreStoredValue(storageKeys.characterPhones, previousLegacyValue.value);
    }
    return { result: indexResult, imageAssetIds: [] };
  }

  removedEntries.forEach((entry) => { removeStoredValue(storageKeys.characterPhoneV2(entry.id)); });
  if (retainedIndex.length === 0 && previousIndexValue.found) removeStoredValue(storageKeys.characterPhonesIndexV2);
  const result: StorageWriteResult = { success: true };
  return {
    result,
    imageAssetIds: result.success
      ? [...new Set(removed.flatMap((phone) => phone.galleryItems ?? []).map((item) => item.imageAssetId).filter((id): id is string => Boolean(id)))]
      : [],
  };
}
