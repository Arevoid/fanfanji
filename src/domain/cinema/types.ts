export type CinemaAssetKind = "video" | "subtitle" | "frame";

export interface CinemaAssetRef {
  assetId: string;
  kind: CinemaAssetKind;
  mimeType: string;
  byteLength: number;
}

export interface CinemaCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface CinemaMedia {
  id: string;
  ownerIdentityId: string;
  title: string;
  mimeType: string;
  durationMs: number;
  video: CinemaAssetRef;
  subtitle?: CinemaAssetRef;
  subtitleFormat?: "srt" | "vtt";
  synopsis?: string;
  createdAt: number;
  updatedAt: number;
  lastPositionMs: number;
  watchedUntilMs: number;
}

export interface CinemaWatchRoom {
  id: string;
  userIdentityId: string;
  relationId: string;
  characterId: string;
  conversationId: string;
  mediaId: string;
  createdAt: number;
  updatedAt: number;
  positionMs: number;
  watchedUntilMs: number;
  autoReactionEnabled: boolean;
  plotContinuityEnabled?: boolean;
  plotSummary?: string;
  lastPlotSummaryAt?: number;
  lastAutoReactionAt?: number;
}

export interface CinemaDiscussion {
  id: string;
  roomId: string;
  mediaId: string;
  userIdentityId: string;
  relationId: string;
  characterId: string;
  conversationId: string;
  positionMs: number;
  userText: string;
  characterText?: string;
  subtitleContext?: string;
  frameAsset?: CinemaAssetRef;
  createdAt: number;
  savedToMemory?: boolean;
}

export interface CinemaStore {
  schemaVersion: 1;
  media: CinemaMedia[];
  rooms: CinemaWatchRoom[];
  discussions: CinemaDiscussion[];
}

export const createEmptyCinemaStore = (): CinemaStore => ({
  schemaVersion: 1,
  media: [],
  rooms: [],
  discussions: [],
});
