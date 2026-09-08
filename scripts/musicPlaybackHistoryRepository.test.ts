import assert from "node:assert/strict";
import { clearMusicPlaybackHistory, loadMusicPlaybackHistory, recordMusicPlayback } from "../src/core/storage/repositories/musicPlaybackHistoryRepository";
import type { MusicTrack } from "../src/types";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) || null,
  setItem: (key: string, value: string) => { values.set(key, value); },
};
const local: MusicTrack = { id: "local-1", title: "本地歌", artist: "用户", url: "blob:local", isLocal: true, source: "local" };
const remote: MusicTrack = { id: "netease:42:8", title: "云端歌", artist: "歌手", url: "https://audio.test/song.mp3", isLocal: false, source: "netease", providerTrackId: "8", providerAccountId: "42" };

recordMusicPlayback(local, "identity-a", storage, 10);
recordMusicPlayback(remote, "identity-a", storage, 20);
recordMusicPlayback(local, "identity-b", storage, 30);
assert.deepEqual(loadMusicPlaybackHistory("identity-a", storage).map((item) => item.trackId), ["netease:42:8", "local-1"]);
assert.deepEqual(loadMusicPlaybackHistory("identity-b", storage).map((item) => item.trackId), ["local-1"]);
recordMusicPlayback(local, "identity-a", storage, 40);
assert.deepEqual(loadMusicPlaybackHistory("identity-a", storage).map((item) => item.trackId), ["local-1", "netease:42:8"]);
clearMusicPlaybackHistory("identity-a", storage);
assert.deepEqual(loadMusicPlaybackHistory("identity-a", storage), []);
assert.deepEqual(loadMusicPlaybackHistory("identity-b", storage).map((item) => item.trackId), ["local-1"]);

console.log("musicPlaybackHistoryRepository tests passed");
