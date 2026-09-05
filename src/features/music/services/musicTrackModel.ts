import type { MusicTrack, MusicTrackSource } from "../../../types";
import type { NeteaseTrack } from "../neteaseTypes";

export const inferMusicTrackSource = (track: Pick<MusicTrack, "isLocal" | "source" | "providerTrackId">): MusicTrackSource => {
  if (track.source) return track.source;
  if (track.isLocal) return "local";
  if (track.providerTrackId) return "netease";
  return "network-link";
};

export const normalizeMusicTrack = (track: MusicTrack): MusicTrack => {
  const source = inferMusicTrackSource(track);
  return {
    ...track,
    isLocal: source === "local",
    source,
  };
};

export const isLocalMusicTrack = (track: MusicTrack): boolean => inferMusicTrackSource(track) === "local";

export const isNeteaseMusicTrack = (track: MusicTrack): boolean => inferMusicTrackSource(track) === "netease";

export const createNeteaseMusicTrack = (input: {
  accountUserId: string;
  track: NeteaseTrack;
}): MusicTrack => ({
  id: `netease:${input.accountUserId}:${input.track.id}`,
  title: input.track.title,
  artist: input.track.artists.join(" / ") || "未知歌手",
  url: "",
  isLocal: false,
  source: "netease",
  providerTrackId: input.track.id,
  providerAccountId: input.accountUserId,
  coverUrl: input.track.coverUrl,
  duration: typeof input.track.durationMs === "number"
    ? `${Math.floor(input.track.durationMs / 60000).toString().padStart(2, "0")}:${Math.floor(input.track.durationMs / 1000 % 60).toString().padStart(2, "0")}`
    : undefined,
});
