import { createId } from "../../id/createId";
import { readArray, writeArray } from "./repositoryUtils";
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

interface CharacterPhoneIndexEntry {
  id: string;
  ownerIdentityId: string;
  characterId: string;
}

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
    const parsed: unknown = JSON.parse(result.value);
    return isCharacterPhoneRecord(parsed) ? normalizeCharacterPhoneRecord(parsed) : undefined;
  } catch {
    return undefined;
  }
};

const readLegacyCharacterPhones = () => readArray<CharacterPhoneRecord>(storageKeys.characterPhones, []);

function load(): StorageResult<CharacterPhoneRecord[]> {
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
  const legacy = readLegacyCharacterPhones();
  const index = readCharacterPhoneIndex();
  if (!legacy.valid) return { success: false, error: legacy.error ?? "parse" };
  if (!index.valid) return { success: false, error: index.error ?? "parse" };

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
    if (!legacyWrite.success) return legacyWrite;
  }

  const recordKey = storageKeys.characterPhoneV2(normalizedPhone.id);
  const previousRecordValue = readString(recordKey);
  const recordWrite = writeJson(recordKey, normalizedPhone);
  if (!recordWrite.success) {
    if (legacyMatch && previousLegacyValue.valid) restoreStoredValue(storageKeys.characterPhones, previousLegacyValue.value);
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
 * This deliberately counts localStorage only; binary gallery assets are
 * stored in IndexedDB and are handled by the existing media cleanup tools.
 */
export function getCharacterPhoneStorageUsage(
  ownerIdentityId?: string,
  characterId?: string,
): CharacterPhoneStorageUsage {
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
  const legacy = readLegacyCharacterPhones();
  const index = readCharacterPhoneIndex();
  if (!legacy.valid || !index.valid) {
    return {
      result: { success: false, error: (!legacy.valid ? legacy.error : index.error) ?? "parse" },
      imageAssetIds: [],
    };
  }
  const ids = new Set(characterIds);
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
