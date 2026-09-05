import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getMusicPlaybackAction, shouldRecordIdentityListening } from "../src/features/music/services/musicPlayback";
import { getTrackAudioAssetId } from "../src/utils/audioDb";

assert.equal(getMusicPlaybackAction({ currentTrackId: "song", currentOrigin: "dual:w:left", isPlaying: true, targetTrackId: "song", targetOrigin: "dual:w:left" }), "pause");
assert.equal(getMusicPlaybackAction({ currentTrackId: "song", currentOrigin: "dual:w:left", isPlaying: true, targetTrackId: "song", targetOrigin: "dual:w:right" }), "play");
assert.equal(shouldRecordIdentityListening("music-library"), true);
assert.equal(shouldRecordIdentityListening("dual:w:left"), true);
assert.equal(shouldRecordIdentityListening("dual:w:right"), false);
assert.equal(getTrackAudioAssetId({ id: "legacy" }), "legacy");
assert.equal(getTrackAudioAssetId({ id: "track", audioAssetId: "asset" }), "asset");

const widget = readFileSync(new URL("../src/components/HomeScreenWidgets.tsx", import.meta.url), "utf8");
const dualStart = widget.indexOf("export function DualMusicWidget");
const dualEnd = widget.indexOf("export function", dualStart + 30);
const dualSource = widget.slice(dualStart, dualEnd > dualStart ? dualEnd : undefined);
assert.doesNotMatch(dualSource, /new Audio|\.play\(/);
assert.match(dualSource, /onToggleTrack/);
assert.match(dualSource, /backgroundColor: `rgba\(255, 255, 255, \$\{\(widgetOpacity \?\? 70\) \/ 100\}\)`/);
assert.doesNotMatch(dualSource, /opacity:\s*\(widgetOpacity|style=\{\{\s*opacity/);
console.log("dual music playback tests passed");
