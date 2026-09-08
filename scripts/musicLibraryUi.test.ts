import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appMusic = readFileSync(new URL("../src/components/AppMusic.tsx", import.meta.url), "utf8");
const library = readFileSync(new URL("../src/components/music/MusicLibraryPanel.tsx", import.meta.url), "utf8");

assert.match(appMusic, /MusicLibraryPanel/);
assert.match(appMusic, /showLibrary/);
assert.match(appMusic, /queueTracks/);
assert.match(appMusic, /getNeteaseLyrics/);
assert.match(appMusic, /查看歌词/);
assert.match(library, /首页/);
assert.match(library, /本地/);
assert.match(library, /网易云/);
assert.match(library, /搜索/);
assert.match(library, /createNeteaseQrSession/);
assert.match(library, /getNeteasePlaylists/);
assert.match(library, /onOpenImport/);
assert.match(library, /IndexedDB/);
assert.doesNotMatch(library, /localStorage/);

console.log("musicLibraryUi tests passed");
