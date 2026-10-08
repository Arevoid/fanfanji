import { API_REQUEST_TIMEOUTS, describeApiRequestError, fetchWithTimeout, readResponseTextWithTimeout } from "../../../utils/fetchWithTimeout";
import type {
  NeteaseAccount,
  NeteasePlayableTrack,
  NeteasePlaylist,
  NeteaseQrSession,
  NeteaseTrack,
  NeteaseLyrics,
} from "../neteaseTypes";

export interface NeteaseMusicLibrarySnapshot {
  account: NeteaseAccount;
  playlists: NeteasePlaylist[];
  dailyTracks: NeteaseTrack[];
  warnings: string[];
}

let libraryCache: NeteaseMusicLibrarySnapshot | null = null;
let libraryPromise: Promise<NeteaseMusicLibrarySnapshot> | null = null;

export class NeteaseMusicClientError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(message: string, options: { code?: string; status?: number } = {}) {
    super(message);
    this.name = "NeteaseMusicClientError";
    this.code = options.code;
    this.status = options.status;
  }
}

/**
 * Only a response that explicitly says the session is unauthenticated should
 * send the UI back to the QR login flow. Network, provider and content errors
 * must not make a previously authenticated account look logged out.
 */
export const isNeteaseAuthenticationError = (error: unknown): boolean => {
  if (!(error instanceof NeteaseMusicClientError)) return false;
  return error.status === 401 || error.code === "netease_not_authenticated";
};

type ApiPayload = Record<string, unknown>;

async function requestJson(path: string, init: RequestInit = {}): Promise<ApiPayload> {
  let response: Response;
  try {
    response = await fetchWithTimeout(path, { ...init, credentials: "same-origin", headers: {
      Accept: "application/json",
      ...(init.headers || {}),
    } }, API_REQUEST_TIMEOUTS.modelList);
  } catch (error) {
    throw new NeteaseMusicClientError(describeApiRequestError(error, "网易云代理"));
  }
  let raw: string;
  try {
    raw = await readResponseTextWithTimeout(response, API_REQUEST_TIMEOUTS.modelList);
  } catch (error) {
    throw new NeteaseMusicClientError(describeApiRequestError(error, "网易云代理响应"));
  }
  let payload: ApiPayload;
  try {
    const parsed: unknown = JSON.parse(raw);
    payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ApiPayload : {};
  } catch {
    throw new NeteaseMusicClientError("网易云代理返回了无法解析的响应。", { status: response.status });
  }
  if (!response.ok || payload.success === false) {
    throw new NeteaseMusicClientError(String(payload.error || "网易云服务请求失败。"), {
      code: typeof payload.code === "string" ? payload.code : undefined,
      status: response.status,
    });
  }
  return payload;
}

export const createNeteaseQrSession = async (): Promise<NeteaseQrSession> => {
  const payload = await requestJson("/api/music/netease/qr/create", { method: "POST" });
  return {
    key: String(payload.key || ""),
    qrUrl: typeof payload.qrUrl === "string" ? payload.qrUrl : undefined,
    qrImage: typeof payload.qrImage === "string" ? payload.qrImage : undefined,
    status: payload.status === "waiting" ? "waiting" : "unknown",
  };
};

export const checkNeteaseQrSession = async (key: string): Promise<NeteaseQrSession> => {
  const payload = await requestJson("/api/music/netease/qr/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const status = ["expired", "waiting", "scanned", "authorized"].includes(String(payload.status))
    ? payload.status as NeteaseQrSession["status"]
    : "unknown";
  return { key: String(payload.key || key), status };
};

export const getNeteaseAccount = async (): Promise<NeteaseAccount> => {
  const payload = await requestJson("/api/music/netease/account", { method: "GET" });
  return payload.account as NeteaseAccount;
};

export const getNeteasePlaylists = async (): Promise<{ account: NeteaseAccount; playlists: NeteasePlaylist[] }> => {
  const payload = await requestJson("/api/music/netease/playlists", { method: "GET" });
  return { account: payload.account as NeteaseAccount, playlists: Array.isArray(payload.playlists) ? payload.playlists as NeteasePlaylist[] : [] };
};

export const getNeteasePlaylistTracks = async (playlistId: string): Promise<NeteaseTrack[]> => {
  const payload = await requestJson(`/api/music/netease/playlists/${encodeURIComponent(playlistId)}/tracks`, { method: "GET" });
  return Array.isArray(payload.tracks) ? payload.tracks as NeteaseTrack[] : [];
};

export const searchNeteaseTracks = async (keywords: string): Promise<NeteaseTrack[]> => {
  const payload = await requestJson(`/api/music/netease/search?keywords=${encodeURIComponent(keywords)}`, { method: "GET" });
  return Array.isArray(payload.tracks) ? payload.tracks as NeteaseTrack[] : [];
};

export const getNeteaseDailyRecommendations = async (): Promise<NeteaseTrack[]> => {
  const payload = await requestJson(`/api/music/netease/recommendations/daily?t=${Date.now()}`, { method: "GET" });
  return Array.isArray(payload.tracks) ? payload.tracks as NeteaseTrack[] : [];
};

/**
 * Warm the authenticated music library before the music app is opened. The
 * promise is shared so startup preloading and the first screen render never
 * issue duplicate account/playlist/recommendation requests.
 */
export const preloadNeteaseMusicLibrary = async (): Promise<NeteaseMusicLibrarySnapshot> => {
  if (libraryCache) return libraryCache;
  if (libraryPromise) return libraryPromise;

  libraryPromise = (async () => {
    const account = await getNeteaseAccount();
    const [playlistResult, dailyResult] = await Promise.allSettled([
      getNeteasePlaylists(),
      getNeteaseDailyRecommendations(),
    ]);

    if (playlistResult.status !== "fulfilled" && isNeteaseAuthenticationError(playlistResult.reason)) throw playlistResult.reason;
    if (dailyResult.status === "rejected" && isNeteaseAuthenticationError(dailyResult.reason)) throw dailyResult.reason;

    const warnings = [
      playlistResult.status === "rejected" ? (playlistResult.reason instanceof Error ? playlistResult.reason.message : "网易云歌单读取失败。") : "",
      dailyResult.status === "rejected" ? (dailyResult.reason instanceof Error ? dailyResult.reason.message : "网易云每日推荐读取失败。") : "",
    ].filter(Boolean);

    const snapshot: NeteaseMusicLibrarySnapshot = {
      account: playlistResult.status === "fulfilled" ? (playlistResult.value.account || account) : account,
      playlists: playlistResult.status === "fulfilled" ? playlistResult.value.playlists : [],
      dailyTracks: dailyResult.status === "fulfilled" ? dailyResult.value : [],
      warnings,
    };
    libraryCache = snapshot;
    return snapshot;
  })().catch((error) => {
    libraryPromise = null;
    throw error;
  });

  return libraryPromise;
};

export const getNeteaseMusicLibraryCache = (): NeteaseMusicLibrarySnapshot | null => libraryCache;

export const clearNeteaseMusicLibraryCache = (): void => {
  libraryCache = null;
  libraryPromise = null;
};

export const getNeteaseTrackUrl = async (trackId: string, level: "standard" | "higher" | "exhigh" = "standard"): Promise<NeteasePlayableTrack> => {
  const payload = await requestJson(`/api/music/netease/tracks/${encodeURIComponent(trackId)}/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level }),
  });
  return payload.track as NeteasePlayableTrack;
};

export const getNeteaseTrackStreamUrl = (trackId: string, level: "standard" | "higher" | "exhigh" = "standard"): string =>
  `/api/music/netease/tracks/${encodeURIComponent(trackId)}/stream?level=${encodeURIComponent(level)}`;

export const getNeteaseLyrics = async (trackId: string): Promise<NeteaseLyrics> => {
  const payload = await requestJson(`/api/music/netease/tracks/${encodeURIComponent(trackId)}/lyrics`, { method: "GET" });
  return payload.lyrics as NeteaseLyrics;
};

export const logoutNetease = async (): Promise<void> => {
  await requestJson("/api/music/netease/logout", { method: "POST" });
};
