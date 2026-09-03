import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseSubtitleText, getSubtitleContext } from "../src/features/cinema/subtitleParser";

const srt = `1\n00:00:01,000 --> 00:00:03,500\n你好，世界。\n\n2\n00:00:04,000 --> 00:00:06,000\n继续播放`;
const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:03.500\n你好 <i>世界</i>`;

const srtCues = parseSubtitleText(srt, "srt");
assert.equal(srtCues.length, 2);
assert.equal(srtCues[0].startMs, 1000);
assert.equal(srtCues[0].endMs, 3500);
assert.match(getSubtitleContext(srtCues, 2000, 0), /你好，世界。/);
assert.equal(parseSubtitleText(vtt, "vtt")[0].text, "你好 世界");

const appSource = fs.readFileSync(path.resolve("src/components/AppCinema.tsx"), "utf8");
const appShell = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
assert.match(appSource, /userIdentityId/);
assert.match(appSource, /relationId/);
assert.match(appSource, /sourceApp: "cinema"/);
assert.match(appSource, /sourceCinemaId/);
assert.match(appSource, /conversationId: relation\.conversationId/);
assert.match(appSource, /保存为观影记忆/);
assert.match(appSource, /imageDataUrl/);
assert.match(appShell, /id: "cinema"/);
assert.doesNotMatch(appShell.slice(appShell.indexOf("const DEFAULT_HOME_SCREEN_ITEMS"), appShell.indexOf("const DEFAULT_WORLDBOOK_ENTRIES")), /id: "cinema"/);

console.log("PASS cinemaApp.test.ts");
