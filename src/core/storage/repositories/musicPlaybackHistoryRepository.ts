import type { MusicPlaybackHistoryItem, MusicTrack } from "../../../types";
import { inferMusicTrackSource } from "../../../features/music/services/musicTrackModel";

export const MUSIC_PLAYBACK_HISTORY_KEY = "phone_music_playback_history_v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const readHistory = (storage: StorageLike): MusicPlaybackHistoryItem[] => {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(MUSIC_PLAYBACK_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is MusicPlaybackHistoryItem => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.ownerIdentityId === "string" && typeof item.trackId === "string")) : [];
  } catch {
    return [];
  }
};

export const loadMusicPlaybackHistory = (ownerIdentityId: string, storage: StorageLike = localStorage): MusicPlaybackHistoryItem[] =>
  readHistory(storage).filter((item) => item.ownerIdentityId === ownerIdentityId).sort((left, right) => right.playedAt - left.playedAt);

export const recordMusicPlayback = (
  track: MusicTrack,
  ownerIdentityId: string,
  storage: StorageLike = localStorage,
  now = Date.now(),
): MusicPlaybackHistoryItem[] => {
  const previous = readHistory(storage);
  const item: MusicPlaybackHistoryItem = {
    id: `${ownerIdentityId}:${track.id}`,
    ownerIdentityId,
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    source: inferMusicTrackSource(track),
    providerTrackId: track.providerTrackId,
    providerAccountId: track.providerAccountId,
    playedAt: now,
  };
  const next = [item, ...previous.filter((entry) => entry.id !== item.id)].slice(0, 100);
  storage.setItem(MUSIC_PLAYBACK_HISTORY_KEY, JSON.stringify(next));
  return next.filter((entry) => entry.ownerIdentityId === ownerIdentityId);
};

export const clearMusicPlaybackHistory = (ownerIdentityId: string, storage: StorageLike = localStorage): void => {
  const next = readHistory(storage).filter((item) => item.ownerIdentityId !== ownerIdentityId);
  storage.setItem(MUSIC_PLAYBACK_HISTORY_KEY, JSON.stringify(next));
};
