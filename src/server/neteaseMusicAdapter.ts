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

export interface NeteasePlayableResolution {
  track: NeteasePlayableTrack;
  upstreamId: string;
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
  if ([403, 404, 405].includes(error.status || 0) || [403, 404, 405].includes(error.code || 0)) return true;
  return capabilityRestrictionPattern.test(error.message);
};

const isNeteaseMethodMismatch = (error: unknown): boolean => {
  if (!(error instanceof NeteaseMusicApiError)) return false;
  return [404, 405].includes(error.status || 0) || [404, 405].includes(error.code || 0)
    || /method not allowed|route|not found|浠ｇ悊璺緞|璺緞涓嶅瓨鍦?/iu.test(error.message);
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

  const request = async (path: string, init: RequestInit = {}, requestOptions: { allowFailover?: boolean; preferredUpstreamId?: string; suppressCapabilityClassification?: boolean } = {}): Promise<{ payload: NeteaseResponse; sessionCookie?: string; upstreamId: string }> => {
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
          if (!requestOptions.suppressCapabilityClassification) {
            capabilityFailures += 1;
            pool.markIncompatible(target, typed.message);
          }
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

  const hasPlayableUrl = (payload: NeteaseResponse): boolean => {
    const source = Array.isArray(payload.data) ? payload.data[0] : undefined;
    const item = asRecord(source);
    return Boolean(asString(item.url) || asString(payload.dataUrl));
  };

  const requestWithMethodFallback = async (path: string) => {
    try {
      // The public NeteaseCloudMusicApi contract documents GET for these
      // routes. Keep a POST fallback for older compatible deployments.
      return await request(path, { method: "GET" }, { suppressCapabilityClassification: true });
    } catch (error) {
      if (!isNeteaseMethodMismatch(error)) throw error;
      return request(path, { method: "POST" }, { suppressCapabilityClassification: true });
    }
  };

  const requestPlayablePayload = async (trackId: string, level: "standard" | "higher" | "exhigh") => {
    // Some deployed NeteaseCloudMusicApi versions expose only the legacy
    // /song/url route, while newer versions expose /song/url/v1. Try the
    // modern route first, then the legacy route on the same upstream before
    // declaring that upstream unable to resolve this song.
    const legacyBitrate = level === "exhigh" ? 320000 : level === "higher" ? 192000 : 128000;
    const paths = [
      appendQuery("/song/url/v1", { id: trackId, level }),
      appendQuery("/song/url", { id: trackId, br: legacyBitrate }),
    ];
    let lastResponse: { payload: NeteaseResponse; sessionCookie?: string; upstreamId: string } | undefined;
    let lastError: unknown;
    for (const path of paths) {
      try {
        const response = await requestWithMethodFallback(path);
        lastResponse = response;
        if (hasPlayableUrl(response.payload)) return response;
      } catch (error) {
        lastError = error;
        // A provider may reject only the modern route (403/404/405) while
        // still serving the legacy route. Other failures should keep their
        // original retry/auth/rate-limit semantics.
        if (!(error instanceof NeteaseMusicApiError)
          || ![403, 404, 405].includes(error.status || 0)
          && ![403, 404, 405].includes(error.code || 0)) throw error;
      }
    }
    if (lastResponse) return lastResponse;
    throw lastError instanceof Error ? lastError : new NeteaseMusicApiError("Netease playback URL lookup failed.", { status: 502 });
  };

  const resolvePlayableTrack = async (trackId: string, level: "standard" | "higher" | "exhigh"): Promise<NeteasePlayableResolution> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < Math.max(1, pool.targets.length); attempt += 1) {
      const response = await requestPlayablePayload(trackId, level);
      const source = Array.isArray(response.payload.data) ? response.payload.data[0] : undefined;
      const item = asRecord(source);
      const url = asString(item.url) || asString(response.payload.dataUrl);
      if (url) {
        return {
          upstreamId: response.upstreamId,
          track: {
            id: trackId,
            url,
            ...(asNumber(item.br) !== undefined ? { bitrate: asNumber(item.br) } : {}),
            ...(asString(item.type) ? { format: asString(item.type) } : {}),
            ...(asNumber(item.expi) ? { expiresAt: Date.now() + Number(item.expi) * 1000 } : {}),
          },
        };
      }
      const target = pool.targets.find((candidate) => candidate.id === response.upstreamId);
      const itemCode = asNumber(item.code);
      const fee = asNumber(item.fee);
      const restricted = itemCode === -110 || fee === 1 || fee === 4 || Boolean(item.freeTrialInfo && item.freeTrialInfo !== "null");
      const error = new NeteaseMusicApiError(
        restricted
          ? "这首网易云歌曲当前没有可用播放权限，可能需要 VIP 或受版权地区限制。请更换有播放权限的歌曲或账号。"
          : "Netease upstream returned no playable audio URL.",
        { code: itemCode ?? asNumber(response.payload.code), status: restricted ? 403 : 502 },
      );
      lastError = error;
      // A missing URL is often a song-level VIP/region restriction, not a
      // broken API. Only cool down this target briefly so one restricted song
      // does not hide a healthy upstream for every later song.
      if (target) pool.markFailure(target);
    }
    throw lastError instanceof Error ? lastError : new NeteaseMusicApiError("Netease playback URL lookup failed.", { status: 502 });
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
      return (await resolvePlayableTrack(trackId, level)).track;
    },

    async getPlayableUrlWithUpstream(trackId: string, level: "standard" | "higher" | "exhigh" = "standard"): Promise<NeteasePlayableResolution> {
      if (!trackId.trim()) throw new Error("缃戞槗浜戞瓕鏇?ID 涓嶈兘涓虹┖銆?");
      return resolvePlayableTrack(trackId, level);
    },

    markUpstreamFailure(upstreamId: string, reason?: string): void {
      const target = pool.targets.find((candidate) => candidate.id === upstreamId);
      if (target) pool.markFailure(target);
      if (target && reason) pool.markIncompatible(target, reason);
    },

    getUpstreamIds(): string[] {
      return pool.targets.map((target) => target.id);
    },

    async fetchPlayableStream(trackId: string, level: "standard" | "higher" | "exhigh" = "standard", init: RequestInit = {}): Promise<{ response: Response; upstreamId: string; track: NeteasePlayableTrack }> {
      let lastError: unknown;
      const fetchAudioUrl = async (url: string, requestInit: RequestInit = init): Promise<Response> => {
        const baseHeaders = Object.fromEntries(new Headers(requestInit.headers || {}).entries());
        // A few CDN nodes reject a request with an unexpected Referer while
        // others reject requests without the official music Referer. Try the
        // normal provider header first, then retry the same signed URL without
        // Referer before failing over to another upstream.
        const headerVariants = [
          { Accept: "audio/*", Referer: "https://music.163.com/", "User-Agent": "Mozilla/5.0", ...baseHeaders },
          { Accept: "audio/*", "User-Agent": "Mozilla/5.0", ...baseHeaders },
        ];
        let lastResponse: Response | undefined;
        for (let index = 0; index < headerVariants.length; index += 1) {
          const response = await fetchWithTimeout(url, {
            ...requestInit,
            method: "GET",
            redirect: "follow",
            headers: headerVariants[index],
          }, Math.min(timeoutMs, API_REQUEST_TIMEOUTS.remoteAsset), fetchImpl);
          const contentType = response.headers.get("content-type") || "";
          const isAudioResponse = !contentType || /^(audio\/|application\/octet-stream)/iu.test(contentType);
          if ((response.ok || response.status === 206) && isAudioResponse) return response;
          await response.body?.cancel().catch(() => undefined);
          lastResponse = response;
          // Only the header-sensitive 403 case merits a second fetch. A 404,
          // 5xx, HTML error page, or other status should go to pool failover.
          if (index === 0 && response.status !== 403) break;
        }
        const status = lastResponse?.status || 502;
        const contentType = lastResponse?.headers.get("content-type") || "";
        const isAudioResponse = !contentType || /^(audio\/|application\/octet-stream)/iu.test(contentType);
        throw new NeteaseMusicApiError(isAudioResponse ? `Netease audio stream failed (HTTP ${status}).` : `Netease returned non-audio content (HTTP ${status}).`, { status });
      };

      for (let attempt = 0; attempt < Math.max(1, pool.targets.length); attempt += 1) {
        let resolution: NeteasePlayableResolution | undefined;
        try {
          resolution = await resolvePlayableTrack(trackId, level);
          const response = await fetchAudioUrl(resolution.track.url);
          return { response, upstreamId: resolution.upstreamId, track: resolution.track };
        } catch (error) {
          lastError = error;
          if (error instanceof NeteaseMusicApiError && (error.status === 401 || error.status === 429 || error.code === 301 || error.code === 429)) throw error;
          // A 403/-110 produced before a playable URL is resolved is a
          // song-level VIP/region restriction. Do not waste time retrying the
          // same song through the public outer-url fallback.
          if (!resolution && error instanceof NeteaseMusicApiError && (error.status === 403 || error.code === -110)) throw error;
          const target = pool.targets.find((candidate) => candidate.id === resolution?.upstreamId) || pool.targets[attempt];
          if (target) pool.markFailure(target);
        }
      }

      // Official outer-url is a final, non-authenticated fallback for public
      // songs. It does not bypass VIP/region restrictions; it only helps when
      // a compatible API returned no usable signed URL or its CDN node denied
      // the proxy request.
      try {
        const fallbackUrl = `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(trackId)}.mp3`;
        // The authenticated cookie belongs to the configured API upstream;
        // never forward it to the official direct-download host.
        const fallbackHeaders = new Headers(init.headers || {});
        fallbackHeaders.delete("Cookie");
        const response = await fetchAudioUrl(fallbackUrl, { ...init, headers: fallbackHeaders });
        return { response, upstreamId: pool.targets[0]?.id || "official-direct", track: { id: trackId, url: fallbackUrl, format: "mp3" } };
      } catch (error) {
        lastError = error;
      }
      throw lastError instanceof Error ? lastError : new NeteaseMusicApiError("Netease audio stream is unavailable.", { status: 502 });
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
