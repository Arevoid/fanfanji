import type { MusicRemoteLibraryItem, MusicTrack } from "../../../types";
import { inferMusicTrackSource } from "../../../features/music/services/musicTrackModel";

export const MUSIC_REMOTE_LIBRARY_KEY = "phone_music_remote_library_v1";
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const readAll = (storage: StorageLike): MusicRemoteLibraryItem[] => {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(MUSIC_REMOTE_LIBRARY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is MusicRemoteLibraryItem => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.ownerIdentityId === "string" && item.provider === "netease")) : [];
  } catch {
    return [];
  }
};

export const loadMusicRemoteLibrary = (ownerIdentityId: string, providerAccountId?: string, storage: StorageLike = localStorage): MusicRemoteLibraryItem[] =>
  readAll(storage).filter((item) => item.ownerIdentityId === ownerIdentityId && (!providerAccountId || item.providerAccountId === providerAccountId)).sort((left, right) => right.savedAt - left.savedAt);

export const toggleMusicRemoteLibraryItem = (track: MusicTrack, ownerIdentityId: string, providerAccountId: string, storage: StorageLike = localStorage, now = Date.now()): MusicRemoteLibraryItem[] => {
  if (inferMusicTrackSource(track) !== "netease" || !track.providerTrackId) return loadMusicRemoteLibrary(ownerIdentityId, providerAccountId, storage);
  const id = `${ownerIdentityId}:netease:${providerAccountId}:${track.providerTrackId}`;
  const previous = readAll(storage);
  const exists = previous.some((item) => item.id === id);
  const next = exists
    ? previous.filter((item) => item.id !== id)
    : [{ id, ownerIdentityId, provider: "netease" as const, providerAccountId, providerTrackId: track.providerTrackId, title: track.title, artist: track.artist, coverUrl: track.coverUrl, savedAt: now }, ...previous].slice(0, 200);
  storage.setItem(MUSIC_REMOTE_LIBRARY_KEY, JSON.stringify(next));
  return next.filter((item) => item.ownerIdentityId === ownerIdentityId && item.providerAccountId === providerAccountId);
};
