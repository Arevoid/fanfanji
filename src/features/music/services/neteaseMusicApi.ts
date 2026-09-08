import { API_REQUEST_TIMEOUTS, fetchWithTimeout } from "../../../utils/fetchWithTimeout";
import type {
  NeteaseAccount,
  NeteasePlayableTrack,
  NeteasePlaylist,
  NeteaseQrSession,
  NeteaseTrack,
  NeteaseLyrics,
} from "../neteaseTypes";

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

type ApiPayload = Record<string, unknown>;

async function requestJson(path: string, init: RequestInit = {}): Promise<ApiPayload> {
  let response: Response;
  try {
    response = await fetchWithTimeout(path, { ...init, credentials: "same-origin", headers: {
      Accept: "application/json",
      ...(init.headers || {}),
    } }, API_REQUEST_TIMEOUTS.modelList);
  } catch (error) {
    throw new NeteaseMusicClientError(error instanceof Error ? error.message : "网易云代理网络请求失败。");
  }
  const raw = await response.text();
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
