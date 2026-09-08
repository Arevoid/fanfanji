import assert from "node:assert/strict";
import { loadMusicRemoteLibrary, toggleMusicRemoteLibraryItem } from "../src/core/storage/repositories/musicRemoteLibraryRepository";
import type { MusicTrack } from "../src/types";

const values = new Map<string, string>();
const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
const track: MusicTrack = { id: "netease:42:8", title: "云端歌", artist: "歌手", url: "", isLocal: false, source: "netease", providerTrackId: "8", providerAccountId: "42" };
toggleMusicRemoteLibraryItem(track, "identity-a", "42", storage, 10);
assert.equal(loadMusicRemoteLibrary("identity-a", "42", storage)[0]?.id, "identity-a:netease:42:8");
assert.deepEqual(loadMusicRemoteLibrary("identity-b", "42", storage), []);
toggleMusicRemoteLibraryItem(track, "identity-a", "42", storage, 20);
assert.deepEqual(loadMusicRemoteLibrary("identity-a", "42", storage), []);

console.log("musicRemoteLibraryRepository tests passed");
