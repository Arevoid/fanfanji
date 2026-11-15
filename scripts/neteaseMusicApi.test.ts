import assert from "node:assert/strict";
import {
  clearNeteaseMusicLibraryCache,
  createNeteaseQrSession,
  getNeteasePlaylistTracksPage,
  isNeteaseAuthenticationError,
  NeteaseMusicClientError,
  preloadNeteaseMusicLibrary,
} from "../src/features/music/services/neteaseMusicApi";

assert.equal(isNeteaseAuthenticationError(new NeteaseMusicClientError("登录失效", { status: 401 })), true);
assert.equal(isNeteaseAuthenticationError(new NeteaseMusicClientError("登录失效", { code: "netease_not_authenticated" })), true);
assert.equal(isNeteaseAuthenticationError(new NeteaseMusicClientError("服务暂时不可用", { status: 502 })), false);
assert.equal(isNeteaseAuthenticationError(new Error("网络暂时不可用")), false);
const limited = new NeteaseMusicClientError("请求过于频繁", { code: "netease_rate_limited", status: 429, retryAfterSeconds: 12 });
assert.equal(limited.retryAfterSeconds, 12);
assert.equal(limited.code, "netease_rate_limited");

const previousFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const path = new URL(String(input), "http://localhost").pathname;
  if (path.endsWith("/account")) {
    return new Response(JSON.stringify({ success: true, account: { userId: "42", nickname: "饭饭" } }), { status: 200 });
  }
  if (path.endsWith("/playlists")) {
    return new Response(JSON.stringify({ success: false, code: "netease-provider", error: "网易云接口 /user/playlist 请求超时（30 秒）。" }), { status: 504 });
  }
  if (path.endsWith("/recommendations/daily")) {
    return new Response(JSON.stringify({ success: true, tracks: [] }), { status: 200 });
  }
  throw new Error(`unexpected request: ${path}`);
}) as typeof fetch;
clearNeteaseMusicLibraryCache();
const partialLibrary = await preloadNeteaseMusicLibrary();
assert.equal(partialLibrary.account.userId, "42");
assert.deepEqual(partialLibrary.playlists, []);
assert.deepEqual(partialLibrary.dailyTracks, []);
assert.equal(partialLibrary.warnings.length, 1);
assert.match(partialLibrary.warnings[0], /user\/playlist/);
clearNeteaseMusicLibraryCache();
globalThis.fetch = previousFetch;

const playlistFetchCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), "http://localhost");
  playlistFetchCalls.push(url.toString());
  const offset = Number(url.searchParams.get("offset") || 0);
  return new Response(JSON.stringify(offset === 0
    ? { success: true, tracks: [{ id: "1", title: "第一页", artists: [] }, { id: "2", title: "第一页第二首", artists: [] }], nextOffset: 2, hasMore: true }
    : { success: true, tracks: [{ id: "3", title: "第二页", artists: [] }], nextOffset: 3, hasMore: false }), { status: 200 });
}) as typeof fetch;
clearNeteaseMusicLibraryCache();
const firstPage = await getNeteasePlaylistTracksPage("playlist-1");
assert.equal(firstPage.tracks.length, 2);
assert.equal(firstPage.hasMore, true);
const secondPage = await getNeteasePlaylistTracksPage("playlist-1", { offset: firstPage.nextOffset });
assert.deepEqual(secondPage.tracks.map((track) => track.id), ["3"]);
assert.equal(secondPage.hasMore, false);
const cachedPlaylist = await getNeteasePlaylistTracksPage("playlist-1");
assert.deepEqual(cachedPlaylist.tracks.map((track) => track.id), ["1", "2", "3"]);
assert.equal(playlistFetchCalls.length, 2);
globalThis.fetch = previousFetch;

let qrCreateRequests = 0;
const beforeQrRateLimitFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  qrCreateRequests += 1;
  return new Response("upstream rate limited", { status: 429, headers: { "retry-after": "20" } });
}) as typeof fetch;
await assert.rejects(() => createNeteaseQrSession(), (error: unknown) => error instanceof NeteaseMusicClientError && error.code === "netease_rate_limited" && error.retryAfterSeconds === 20);
await assert.rejects(() => createNeteaseQrSession(), (error: unknown) => error instanceof NeteaseMusicClientError && error.status === 429 && error.retryAfterSeconds !== undefined);
assert.equal(qrCreateRequests, 1);
globalThis.fetch = beforeQrRateLimitFetch;

console.log("neteaseMusicApi tests passed");
