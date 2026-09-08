export type MusicPlaybackAction = "play" | "pause";

export const getMusicPlaybackAction = (input: {
  currentTrackId?: string;
  currentOrigin?: string | null;
  isPlaying: boolean;
  targetTrackId: string;
  targetOrigin: string;
}): MusicPlaybackAction =>
  input.isPlaying
  && input.currentTrackId === input.targetTrackId
  && input.currentOrigin === input.targetOrigin
    ? "pause"
    : "play";

export const shouldRecordIdentityListening = (origin: string) =>
  origin === "music-library" || /^dual:[^:]+:left$/.test(origin);
