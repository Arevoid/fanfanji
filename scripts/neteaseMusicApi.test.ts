import assert from "node:assert/strict";
import {
  clearNeteaseMusicLibraryCache,
  isNeteaseAuthenticationError,
  NeteaseMusicClientError,
  preloadNeteaseMusicLibrary,
} from "../src/features/music/services/neteaseMusicApi";

assert.equal(isNeteaseAuthenticationError(new NeteaseMusicClientError("登录失效", { status: 401 })), true);
assert.equal(isNeteaseAuthenticationError(new NeteaseMusicClientError("登录失效", { code: "netease_not_authenticated" })), true);
assert.equal(isNeteaseAuthenticationError(new NeteaseMusicClientError("服务暂时不可用", { status: 502 })), false);
assert.equal(isNeteaseAuthenticationError(new Error("网络暂时不可用")), false);

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

console.log("neteaseMusicApi tests passed");
