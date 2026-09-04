import { createId } from "../../id/createId";
import { readArray, writeArray } from "./repositoryUtils";
import { storageKeys } from "../storageKeys";
import type { Character } from "../../../types";
import type { CharacterPhoneRecord } from "../../../domain/characterPhone/types";
import type { StorageWriteResult } from "../storageTypes";

const load = () => readArray<CharacterPhoneRecord>(storageKeys.characterPhones, []);

const LEGACY_MUSIC_TITLES = new Set([
  "Night Mood",
  "Quiet City Lights",
  "Soft Rain",
  "First Light",
]);

export const CHARACTER_PHONE_DEFAULT_WALLPAPER =
  "linear-gradient(145deg, #eeeeec 0%, #fafaf9 48%, #e4e4e2 100%)";

export function normalizeCharacterPhonePasscode(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.padStart(4, "0").slice(-4);
}

const passcodeFor = (character: Character) => {
  void character;
  return "0000";
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
  return phone ? normalizeMusicPersistence(phone) : undefined;
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

function normalizeCharacterPhoneRecord(phone: CharacterPhoneRecord): CharacterPhoneRecord {
  return normalizeMusicPersistence({
    ...phone,
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
    galleryItems: phone.galleryItems ?? [],
    musicTracks: phone.musicTracks ?? [],
    listeningHistory: phone.listeningHistory ?? [],
    musicPlaylists: phone.musicPlaylists ?? [],
    actionLog: (phone.actionLog ?? []).slice(-300),
    lifeEvents: (phone.lifeEvents ?? []).slice(-200),
    activities: (phone.activities ?? []).slice(-300),
  });
}

export function saveCharacterPhone(phone: CharacterPhoneRecord) {
  const loaded = load();
  if (loaded.found && !loaded.valid) {
    return { success: false as const, error: loaded.error ?? "parse" as const };
  }
  const normalizedPhone = normalizeCharacterPhoneRecord(phone);
  const current = loaded.value.map(normalizeCharacterPhoneRecord);
  return writeArray(storageKeys.characterPhones, [
    ...current.filter((item) => item.id !== normalizedPhone.id
      && !(item.ownerIdentityId === normalizedPhone.ownerIdentityId && item.characterId === normalizedPhone.characterId)),
    normalizedPhone,
  ]);
}

export function removeCharacterPhonesByCharacterIds(characterIds: Iterable<string>): {
  result: StorageWriteResult;
  imageAssetIds: string[];
} {
  const loaded = load();
  if (loaded.found && !loaded.valid) {
    return {
      result: { success: false, error: loaded.error ?? "parse" },
      imageAssetIds: [],
    };
  }
  const ids = new Set(characterIds);
  const removed = loaded.value.filter((phone) => ids.has(phone.characterId));
  const retained = loaded.value.filter((phone) => !ids.has(phone.characterId));
  const result = writeArray(storageKeys.characterPhones, retained);
  return {
    result,
    imageAssetIds: result.success
      ? [...new Set(removed.flatMap((phone) => phone.galleryItems ?? []).map((item) => item.imageAssetId).filter((id): id is string => Boolean(id)))]
      : [],
  };
}
