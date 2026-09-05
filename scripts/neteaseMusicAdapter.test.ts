import assert from "node:assert/strict";
import { createNeteaseMusicAdapter, NeteaseMusicApiError } from "../src/server/neteaseMusicAdapter";

type MockResponse = { status?: number; body: unknown; ok?: boolean };

function createMockFetch(responses: MockResponse[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return new Response(JSON.stringify(next.body), {
      status: next.status || 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchMock };
}

const qr = createMockFetch([
  { body: { code: 200, data: { unikey: "key-1" } } },
  { body: { code: 200, data: { qrurl: "https://music.163.com/qr/key-1", qrimg: "data:image/png;base64,qr" } } },
  { body: { code: 801 } },
  { body: { code: 802 } },
]);
const adapter = createNeteaseMusicAdapter({ baseUrl: "https://ncm.example.test/", fetchImpl: qr.fetchMock });
const created = await adapter.createQrSession();
assert.deepEqual(created, {
  key: "key-1",
  qrUrl: "https://music.163.com/qr/key-1",
  qrImage: "data:image/png;base64,qr",
  status: "waiting",
});
assert.equal((await adapter.checkQrSession("key-1")).status, "waiting");
assert.equal((await adapter.checkQrSession("key-1")).status, "scanned");
assert.equal(qr.calls[0].url, "https://ncm.example.test/login/qr/key");
assert.match(qr.calls[2].url, /\/login\/qr\/check\?key=key-1&timestamp=/);

const library = createMockFetch([
  { body: { code: 200, account: { id: 42 }, profile: { nickname: "饭饭", avatarUrl: "http://img.test/avatar.jpg" } } },
  { body: { code: 200, playlist: [{ id: 7, name: "我喜欢的音乐", coverImgUrl: "http://img.test/playlist.jpg", trackCount: 1, subscribed: true, creator: { nickname: "饭饭" } }] } },
  { body: { code: 200, songs: [{ id: 8, name: "一首歌", dt: 180000, ar: [{ name: "歌手" }], al: { name: "专辑", picUrl: "http://img.test/cover.jpg" } }] } },
  { body: { code: 200, result: { songs: [{ id: 9, name: "搜索结果", ar: [{ name: "搜索歌手" }] }] } } },
  { body: { code: 200, data: { dailySongs: [{ id: 10, name: "每日歌曲", ar: [{ name: "每日歌手" }] }] } } },
  { body: { code: 200, lrc: { lyric: "[00:01.00]歌词第一行" }, tlyric: { lyric: "[00:01.00]Translated line" } } },
  { body: { code: 200, data: [{ id: 8, url: "http://audio.test/song.mp3", br: 320000, type: "mp3", expi: 60 }] } },
]);
const libraryAdapter = createNeteaseMusicAdapter({ baseUrl: "https://ncm.example.test", fetchImpl: library.fetchMock });
assert.deepEqual(await libraryAdapter.getAccount(), { userId: "42", nickname: "饭饭", avatarUrl: "https://img.test/avatar.jpg" });
assert.deepEqual(await libraryAdapter.getPlaylists("42"), [{
  id: "7", name: "我喜欢的音乐", coverUrl: "https://img.test/playlist.jpg", trackCount: 1, creatorName: "饭饭", isFavorite: true,
}]);
assert.deepEqual(await libraryAdapter.getPlaylistTracks("7"), [{
  id: "8", title: "一首歌", artists: ["歌手"], album: "专辑", coverUrl: "https://img.test/cover.jpg", durationMs: 180000,
}]);
assert.deepEqual(await libraryAdapter.searchTracks("搜索结果"), [{ id: "9", title: "搜索结果", artists: ["搜索歌手"] }]);
assert.deepEqual(await libraryAdapter.getDailyRecommendations(), [{ id: "10", title: "每日歌曲", artists: ["每日歌手"] }]);
assert.deepEqual(await libraryAdapter.getLyrics("8"), { lyric: "[00:01.00]歌词第一行", translatedLyric: "[00:01.00]Translated line" });
const playable = await libraryAdapter.getPlayableUrl("8");
assert.equal(playable.id, "8");
assert.equal(playable.url, "http://audio.test/song.mp3");
assert.equal(playable.bitrate, 320000);
assert.ok(playable.expiresAt && playable.expiresAt > Date.now());

const failing = createNeteaseMusicAdapter({
  baseUrl: "https://ncm.example.test",
  fetchImpl: createMockFetch([{ body: { code: 502, msg: "风控" } }]).fetchMock,
});
await assert.rejects(() => failing.getAccount(), (error: unknown) => error instanceof NeteaseMusicApiError && error.code === 502 && error.message === "风控");

console.log("neteaseMusicAdapter tests passed");
