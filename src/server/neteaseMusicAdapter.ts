import { API_REQUEST_TIMEOUTS, describeApiRequestError, fetchWithTimeout, isApiRequestError, readResponseTextWithTimeout } from "../utils/fetchWithTimeout";
import type { NeteaseAccount, NeteaseLyrics, NeteasePlayableTrack, NeteasePlaylist, NeteasePlaylistTracksPage, NeteaseQrSession as PublicNeteaseQrSession, NeteaseQrStatus, NeteaseTrack } from "../features/music/neteaseTypes";
import { getNeteaseUpstreamPool, isNeteaseUpstreamRetryable, NeteaseUpstreamPool, parseNeteaseUpstreamUrls, type NeteaseUpstreamProbeResult, type NeteaseUpstreamTarget } from "./neteaseUpstreamPool";
export type { NeteaseAccount, NeteaseLyrics, NeteasePlayableTrack, NeteasePlaylist, NeteasePlaylistTracksPage, NeteaseTrack } from "../features/music/neteaseTypes";
export type NeteaseQrSession = PublicNeteaseQrSession & { /** Server-only upstream cookie captured after QR authorization. */ sessionCookie?: string };
export type NeteaseServerQrSession = NeteaseQrSession & { /** Upstream that owns the QR key; QR checks must stay pinned to it. */ upstreamId?: string };

export class NeteaseMusicApiError extends Error {
  readonly status?: number;
  readonly code?: number;
  readonly retryAfterSeconds?: number;

  constructor(message: string, options: { status?: number; code?: number; retryAfterSeconds?: number } = {}) {
    super(message);
    this.name = "NeteaseMusicApiError";
    this.status = options.status;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** NetEase Cloud Music uses code 301 for an expired/missing login session. */
export const isNeteaseAuthenticationError = (error: unknown): boolean => {
  if (!(error instanceof NeteaseMusicApiError)) return false;
  return error.status === 401 || error.code === 301;
};

export interface NeteaseMusicAdapterOptions {
  baseUrl?: string;
  baseUrls?: string[];
  preferredUpstreamId?: string;
  upstreamPool?: NeteaseUpstreamPool;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cookie?: string;
  onUpstreamSelected?: (upstreamId: string) => void;
}

type NeteaseResponse = {
  code?: unknown;
  message?: unknown;
  msg?: unknown;
  data?: unknown;
  account?: unknown;
  profile?: unknown;
  playlist?: unknown;
  playlists?: unknown;
  songs?: unknown;
  dataUrl?: unknown;
  more?: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const normalizeImageUrl = (value: unknown): string | undefined => {
  const url = asString(value);
  if (!url) return undefined;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http://")) return `https://${url.slice("http://".length)}`;
  return url;
};

const asId = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asString(value);
};

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(asString).filter((item): item is string => Boolean(item)) : [];

const normalizeQrStatus = (code: unknown): NeteaseQrStatus => {
  switch (Number(code)) {
    case 800: return "expired";
    case 801: return "waiting";
    case 802: return "scanned";
    case 803: return "authorized";
    default: return "unknown";
  }
};

const readRetryAfterSeconds = (response: Response): number | undefined => {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(300, Math.ceil(seconds));
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  const remaining = Math.ceil((date - Date.now()) / 1000);
  return Math.min(300, Math.max(0, remaining));
};

const rateLimitMessage = (retryAfterSeconds?: number): string => retryAfterSeconds === undefined
  ? "网易云兼容 API 当前请求过于频繁（HTTP 429），请稍后重试。"
  : `网易云兼容 API 当前请求过于频繁，请在 ${retryAfterSeconds} 秒后重试。`;

const appendQuery = (path: string, query: Record<string, string | number | undefined>): string => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
};

const capabilityRestrictionPattern = /(zmusic|仅限|只允许|不支持|forbidden|not found|method not allowed|route)/iu;

export const isNeteaseUpstreamCapabilityError = (error: unknown): boolean => {
  if (!(error instanceof NeteaseMusicApiError)) return false;
  if ([403, 404, 405].includes(error.status || 0)) return true;
  return capabilityRestrictionPattern.test(error.message);
};

const readJson = async (response: Response, timeoutMs: number): Promise<NeteaseResponse> => {
  const retryAfterSeconds = response.status === 429 ? readRetryAfterSeconds(response) : undefined;
  const raw = await readResponseTextWithTimeout(response, timeoutMs);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new NeteaseMusicApiError(
      response.status === 429 ? rateLimitMessage(retryAfterSeconds) : `网易云兼容 API 返回了无法解析的响应（HTTP ${response.status}）。`,
      { status: response.status, retryAfterSeconds },
    );
  }
  const payload = asRecord(parsed);
  if (!response.ok) {
    throw new NeteaseMusicApiError(
      response.status === 429 ? rateLimitMessage(retryAfterSeconds) : asString(payload.message) || asString(payload.msg) || `网易云兼容 API 请求失败（HTTP ${response.status}）。`,
      { status: response.status, code: asNumber(payload.code), retryAfterSeconds },
    );
  }
  const code = asNumber(payload.code);
  if (code !== undefined && code !== 200 && code !== 802 && code !== 801 && code !== 803) {
    throw new NeteaseMusicApiError(
      code === 429 ? rateLimitMessage(retryAfterSeconds) : asString(payload.message) || asString(payload.msg) || `网易云兼容 API 返回错误码 ${code}。`,
      { status: code === 429 ? 429 : response.status, code, retryAfterSeconds },
    );
  }
  return payload as NeteaseResponse;
};

const getNested = (value: unknown, ...keys: string[]): unknown => {
  let current: unknown = value;
  for (const key of keys) current = asRecord(current)[key];
  return current;
};

export function createNeteaseMusicAdapter(options: NeteaseMusicAdapterOptions) {
  const configuredUrls = parseNeteaseUpstreamUrls(options.baseUrl, options.baseUrls?.join("\n"));
  const pool = options.upstreamPool || getNeteaseUpstreamPool(configuredUrls);
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || API_REQUEST_TIMEOUTS.modelList;
  const cookie = options.cookie?.trim();

  const probeCapability = async (target: NeteaseUpstreamTarget): Promise<NeteaseUpstreamProbeResult> => {
    try {
      const probeTimeoutMs = Math.min(timeoutMs, 10_000);
      const response = await fetchWithTimeout(`${target.baseUrl}/login/qr/key`, { method: "POST", headers: { Accept: "application/json" } }, probeTimeoutMs, fetchImpl);
      const raw = await readResponseTextWithTimeout(response, probeTimeoutMs);
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return response.status >= 500 || response.status === 429 ? { status: "unavailable", reason: `HTTP ${response.status}` } : { status: "incompatible", reason: `二维码接口返回了非 JSON 响应（HTTP ${response.status}）` }; }
      const payload = asRecord(parsed);
      if (response.status === 429 || response.status >= 500) return { status: "unavailable", reason: `HTTP ${response.status}` };
      const code = asNumber(payload.code);
      const key = asString(getNested(payload, "data", "unikey"));
      if (response.ok && (code === 200 || code === 801) && key) return { status: "compatible" };
      return { status: "incompatible", reason: asString(payload.message) || asString(payload.msg) || `二维码接口不兼容（HTTP ${response.status}）` };
    } catch (error) {
      if (isApiRequestError(error, "timeout") || isApiRequestError(error, "network")) return { status: "unavailable", reason: describeApiRequestError(error, "网易云上游能力检查") };
      return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) };
    }
  };
  pool.setCapabilityProbe(probeCapability);

  if (!configuredUrls.length && !pool.targets.length) throw new Error("网易云兼容 API 地址不能为空。");

  const request = async (path: string, init: RequestInit = {}, requestOptions: { allowFailover?: boolean; preferredUpstreamId?: string } = {}): Promise<{ payload: NeteaseResponse; sessionCookie?: string; upstreamId: string }> => {
    const endpoint = path.split("?", 1)[0];
    const skipCapabilityProbe = endpoint.startsWith("/login/qr/");
    const candidates = await pool.getCandidates(requestOptions.preferredUpstreamId || options.preferredUpstreamId, { skipCapabilityProbe });
    if (!candidates.length) throw new NeteaseMusicApiError("当前配置的网易云上游均不可用或不兼容标准网易云接口，请更换 NETEASE_API_BASE_URL。", { status: 502 });
    let lastError: unknown;
    let capabilityFailures = 0;
    for (const target of candidates) {
      try {
        const response = await fetchWithTimeout(`${target.baseUrl}${path}`, { ...init, headers: {
          Accept: "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(init.headers || {}),
        } }, timeoutMs, fetchImpl);
        const result = { payload: await readJson(response, timeoutMs), sessionCookie: response.headers.get("set-cookie") || undefined, upstreamId: target.id };
        pool.markSuccess(target);
        if (!skipCapabilityProbe) pool.markCompatible(target);
        options.onUpstreamSelected?.(target.id);
        return result;
      } catch (error) {
        const typed = error instanceof NeteaseMusicApiError ? error : new NeteaseMusicApiError(describeApiRequestError(error, `网易云接口 ${endpoint} `), {
          status: isApiRequestError(error, "timeout") ? 504 : isApiRequestError(error, "network") ? 502 : undefined,
        });
        lastError = typed;
        if (isNeteaseUpstreamCapabilityError(typed)) {
          capabilityFailures += 1;
          pool.markIncompatible(target, typed.message);
          if (requestOptions.allowFailover === false) throw typed;
          continue;
        }
        if (!isNeteaseUpstreamRetryable(typed)) throw typed;
        pool.markFailure(target);
        if (requestOptions.allowFailover === false) throw typed;
      }
    }
    if (capabilityFailures === candidates.length) throw new NeteaseMusicApiError("当前配置的网易云上游均不支持歌单等标准接口，请更换 NETEASE_API_BASE_URL。", { status: 502 });
    throw lastError instanceof Error ? lastError : new NeteaseMusicApiError(`网易云接口 ${endpoint} 暂时不可用。`);
  };

  return {
    async createQrSession(): Promise<NeteaseServerQrSession> {
      const keyResponse = await request("/login/qr/key", { method: "POST" });
      const key = asString(getNested(keyResponse.payload, "data", "unikey"));
      if (!key) throw new NeteaseMusicApiError("网易云兼容 API 没有返回二维码 key。");
      const qrResponse = await request(appendQuery("/login/qr/create", { key, qrimg: 1 }), { method: "POST" }, { allowFailover: false, preferredUpstreamId: keyResponse.upstreamId });
      const qrData = asRecord(qrResponse.payload.data);
      return {
        key,
        qrUrl: asString(qrData.qrurl),
        qrImage: asString(qrData.qrimg),
        status: "waiting",
        upstreamId: qrResponse.upstreamId,
      };
    },

    async checkQrSession(key: string, options: { upstreamId?: string } = {}): Promise<NeteaseServerQrSession> {
      if (!key.trim()) throw new Error("二维码 key 不能为空。");
      const response = await request(appendQuery("/login/qr/check", { key, timestamp: Date.now() }), { method: "POST" }, { allowFailover: !options.upstreamId, preferredUpstreamId: options.upstreamId });
      const payload = response.payload;
      return {
        key,
        status: normalizeQrStatus(payload.code),
        ...(response.sessionCookie ? { sessionCookie: response.sessionCookie } : {}),
        upstreamId: response.upstreamId,
      };
    },

    async getAccount(): Promise<NeteaseAccount> {
      const payload = (await request("/user/account", { method: "POST" })).payload;
      const account = asRecord(payload.account);
      const profile = asRecord(payload.profile);
      const userId = asId(account.id) || asId(profile.userId);
      if (!userId) throw new NeteaseMusicApiError("网易云兼容 API 没有返回当前用户 ID。");
      return {
        userId,
        nickname: asString(profile.nickname),
        avatarUrl: normalizeImageUrl(profile.avatarUrl),
      };
    },

    async getPlaylists(userId: string): Promise<NeteasePlaylist[]> {
      if (!userId.trim()) throw new Error("网易云用户 ID 不能为空。");
      const payload = (await request(appendQuery("/user/playlist", { uid: userId, limit: 100, offset: 0 }), { method: "POST" })).payload;
      const source = Array.isArray(payload.playlist) ? payload.playlist : Array.isArray(payload.playlists) ? payload.playlists : [];
      return source.map((item): NeteasePlaylist | null => {
        const playlist = asRecord(item);
        const id = asId(playlist.id);
        const name = asString(playlist.name);
        if (!id || !name) return null;
        return {
          id,
          name,
          ...(normalizeImageUrl(playlist.coverImgUrl) || normalizeImageUrl(playlist.coverUrl) ? { coverUrl: normalizeImageUrl(playlist.coverImgUrl) || normalizeImageUrl(playlist.coverUrl) } : {}),
          ...(asNumber(playlist.trackCount) !== undefined ? { trackCount: asNumber(playlist.trackCount) } : {}),
          ...(asString(getNested(playlist, "creator", "nickname")) ? { creatorName: asString(getNested(playlist, "creator", "nickname")) } : {}),
          isFavorite: Boolean(playlist.subscribed),
        };
      }).filter((item): item is NeteasePlaylist => Boolean(item));
    },

    async getPlaylistTracksPage(playlistId: string, options: { limit?: number; offset?: number } = {}): Promise<NeteasePlaylistTracksPage> {
      if (!playlistId.trim()) throw new Error("网易云歌单 ID 不能为空。");
      const limit = Math.min(200, Math.max(1, Math.floor(options.limit || 200)));
      const offset = Math.max(0, Math.floor(options.offset || 0));
      const payload = (await request(appendQuery("/playlist/track/all", { id: playlistId, limit, offset }), { method: "POST" })).payload;
      const source = Array.isArray(payload.songs) ? payload.songs : Array.isArray(payload.data) ? payload.data : [];
      const tracks = source.map((item): NeteaseTrack | null => {
        const song = asRecord(item);
        const id = asId(song.id);
        const title = asString(song.name);
        if (!id || !title) return null;
        const album = asRecord(song.al);
        return {
          id,
          title,
          artists: Array.isArray(song.ar) ? song.ar.map((artist) => asString(asRecord(artist).name)).filter((name): name is string => Boolean(name)) : [],
          ...(asString(album.name) ? { album: asString(album.name) } : {}),
          ...(normalizeImageUrl(album.picUrl) ? { coverUrl: normalizeImageUrl(album.picUrl) } : {}),
          ...(asNumber(song.dt) !== undefined ? { durationMs: asNumber(song.dt) } : {}),
        };
      }).filter((item): item is NeteaseTrack => Boolean(item));
      return {
        tracks,
        nextOffset: offset + tracks.length,
        hasMore: payload.more === true || source.length >= limit,
      };
    },

    async getPlaylistTracks(playlistId: string): Promise<NeteaseTrack[]> {
      return (await this.getPlaylistTracksPage(playlistId)).tracks;
    },

    async searchTracks(keywords: string): Promise<NeteaseTrack[]> {
      if (!keywords.trim()) return [];
      const payload = (await request(appendQuery("/cloudsearch", { keywords, type: 1, limit: 30, offset: 0 }), { method: "POST" })).payload;
      const source = Array.isArray(getNested(payload, "result", "songs")) ? getNested(payload, "result", "songs") : [];
      return (source as unknown[]).map((item): NeteaseTrack | null => {
        const song = asRecord(item);
        const id = asId(song.id);
        const title = asString(song.name);
        if (!id || !title) return null;
        const album = asRecord(song.al);
        return {
          id,
          title,
          artists: Array.isArray(song.ar) ? song.ar.map((artist) => asString(asRecord(artist).name)).filter((name): name is string => Boolean(name)) : [],
          ...(asString(album.name) ? { album: asString(album.name) } : {}),
          ...(normalizeImageUrl(album.picUrl) ? { coverUrl: normalizeImageUrl(album.picUrl) } : {}),
          ...(asNumber(song.dt) !== undefined ? { durationMs: asNumber(song.dt) } : {}),
        };
      }).filter((item): item is NeteaseTrack => Boolean(item));
    },

    async getDailyRecommendations(): Promise<NeteaseTrack[]> {
      const payload = (await request("/recommend/songs", { method: "GET" })).payload;
      const data = asRecord(payload.data);
      const source = Array.isArray(data.dailySongs) ? data.dailySongs : Array.isArray(payload.songs) ? payload.songs : [];
      return source.map((item): NeteaseTrack | null => {
        const song = asRecord(item);
        const id = asId(song.id);
        const title = asString(song.name);
        if (!id || !title) return null;
        const album = asRecord(song.al);
        return {
          id,
          title,
          artists: Array.isArray(song.ar) ? song.ar.map((artist) => asString(asRecord(artist).name)).filter((name): name is string => Boolean(name)) : [],
          ...(asString(album.name) ? { album: asString(album.name) } : {}),
          ...(normalizeImageUrl(album.picUrl) ? { coverUrl: normalizeImageUrl(album.picUrl) } : {}),
          ...(asNumber(song.dt) !== undefined ? { durationMs: asNumber(song.dt) } : {}),
        };
      }).filter((item): item is NeteaseTrack => Boolean(item));
    },

    async getPlayableUrl(trackId: string, level: "standard" | "higher" | "exhigh" = "standard"): Promise<NeteasePlayableTrack> {
      if (!trackId.trim()) throw new Error("网易云歌曲 ID 不能为空。");
      const payload = (await request(appendQuery("/song/url/v1", { id: trackId, level }), { method: "POST" })).payload;
      const source = Array.isArray(payload.data) ? payload.data[0] : undefined;
      const item = asRecord(source);
      const url = asString(item.url) || asString(payload.dataUrl);
      if (!url) throw new NeteaseMusicApiError("这首网易云歌曲当前没有可用的播放地址。", { code: asNumber(payload.code) });
      return {
        id: trackId,
        // Keep the provider's original protocol here. The browser consumes
        // this through the same-origin stream proxy, while some NetEase CDN
        // hosts do not serve the signed audio URL over HTTPS.
        url,
        ...(asNumber(item.br) !== undefined ? { bitrate: asNumber(item.br) } : {}),
        ...(asString(item.type) ? { format: asString(item.type) } : {}),
        ...(asNumber(item.expi) ? { expiresAt: Date.now() + Number(item.expi) * 1000 } : {}),
      };
    },

    async getLyrics(trackId: string): Promise<NeteaseLyrics> {
      if (!trackId.trim()) throw new Error("网易云歌曲 ID 不能为空。");
      const payload = (await request(appendQuery("/lyric", { id: trackId }), { method: "POST" })).payload;
      const lyric = asString(getNested(payload, "lrc", "lyric"));
      const translatedLyric = asString(getNested(payload, "tlyric", "lyric"));
      if (!lyric && !translatedLyric) throw new NeteaseMusicApiError("这首歌暂时没有可用歌词。", { code: asNumber(payload.code) });
      return {
        ...(lyric ? { lyric } : {}),
        ...(translatedLyric ? { translatedLyric } : {}),
      };
    },
  };
}
