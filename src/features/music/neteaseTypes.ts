export type NeteaseQrStatus = "expired" | "waiting" | "scanned" | "authorized" | "unknown";
export type NeteaseMusicQuality = "standard" | "higher" | "exhigh";

export interface NeteaseQrSession {
  key: string;
  qrUrl?: string;
  qrImage?: string;
  status: NeteaseQrStatus;
}

export interface NeteaseAccount {
  userId: string;
  nickname?: string;
  avatarUrl?: string;
}

export interface NeteasePlaylist {
  id: string;
  name: string;
  coverUrl?: string;
  trackCount?: number;
  creatorName?: string;
  isFavorite?: boolean;
}

export interface NeteaseTrack {
  id: string;
  title: string;
  artists: string[];
  album?: string;
  coverUrl?: string;
  durationMs?: number;
}

export interface NeteasePlayableTrack {
  id: string;
  url: string;
  bitrate?: number;
  format?: string;
  expiresAt?: number;
}

export interface NeteaseLyrics {
  lyric?: string;
  translatedLyric?: string;
}
