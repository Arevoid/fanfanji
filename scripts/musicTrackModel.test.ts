import assert from "node:assert/strict";
import {
  createNeteaseMusicTrack,
  inferMusicTrackSource,
  isLocalMusicTrack,
  isNeteaseMusicTrack,
  normalizeMusicTrack,
} from "../src/features/music/services/musicTrackModel";

const legacyLocal = normalizeMusicTrack({ id: "local-1", title: "本地", artist: "用户", url: "blob:local", isLocal: true });
assert.equal(legacyLocal.source, "local");
assert.equal(isLocalMusicTrack(legacyLocal), true);

const legacyLink = normalizeMusicTrack({ id: "link-1", title: "直链", artist: "网络", url: "https://audio.test/a.mp3", isLocal: false });
assert.equal(legacyLink.source, "network-link");
assert.equal(inferMusicTrackSource(legacyLink), "network-link");

const remote = createNeteaseMusicTrack({
  accountUserId: "42",
  track: { id: "8", title: "一首歌", artists: ["歌手"], durationMs: 180000, coverUrl: "https://img.test/cover.jpg" },
});
assert.equal(remote.id, "netease:42:8");
assert.equal(remote.source, "netease");
assert.equal(remote.providerTrackId, "8");
assert.equal(remote.providerAccountId, "42");
assert.equal(remote.url, "");
assert.equal(remote.duration, "03:00");
assert.equal(isNeteaseMusicTrack(remote), true);
assert.equal(isLocalMusicTrack(remote), false);

console.log("musicTrackModel tests passed");
