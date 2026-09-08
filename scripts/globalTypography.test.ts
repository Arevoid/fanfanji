import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildFontFaceSource,
  getFontFileExtension,
  getFontFormatHint,
  resolveGlobalFontSource,
  sanitizeGlobalFontSize,
  sanitizeGlobalFontUrl,
} from "../src/features/theme/globalTypography";

assert.equal(sanitizeGlobalFontSize(undefined), 16);
assert.equal(sanitizeGlobalFontSize(11), 13);
assert.equal(sanitizeGlobalFontSize("18"), 18);
assert.equal(sanitizeGlobalFontSize(24), 20);
assert.equal(getFontFileExtension("My Font.TTF"), "ttf");
assert.equal(getFontFileExtension("font.otf"), "otf");
assert.equal(getFontFileExtension("font.woff"), "woff");
assert.equal(getFontFileExtension("font.woff2"), "woff2");
assert.equal(getFontFileExtension("font.zip"), null);
assert.equal(getFontFormatHint("https://example.com/a.woff2?version=2"), "woff2");
assert.equal(sanitizeGlobalFontUrl("javascript:alert(1)"), "");
assert.equal(sanitizeGlobalFontUrl("data:font/woff2;base64,abc"), "");
assert.equal(sanitizeGlobalFontUrl("https://example.com/font.woff2"), "https://example.com/font.woff2");
assert.equal(resolveGlobalFontSource({ globalFontSource: "upload", globalFontAssetId: "asset", globalFontUrl: "" }), "upload");
assert.equal(resolveGlobalFontSource({ globalFontSource: "url", globalFontAssetId: "", globalFontUrl: "https://example.com/font.woff2" }), "url");
assert.equal(resolveGlobalFontSource({ globalFontSource: "url", globalFontAssetId: "", globalFontUrl: "javascript:x" }), "default");
assert.match(buildFontFaceSource("https://example.com/font.woff2"), /^url\("https:\/\/example\.com\/font\.woff2"\) format\("woff2"\)$/);

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src/features/theme/useGlobalTypography.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const clearData = readFileSync(new URL("../src/features/settings/clearApplicationData.ts", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../public/firstPaintTheme.js", import.meta.url), "utf8");

assert.match(app, /useGlobalTypography\(settings\)/);
assert.match(settings, /accept="\.ttf,\.otf,\.woff,\.woff2/);
assert.match(settings, /placeholder="粘贴 TTF \/ OTF \/ WOFF \/ WOFF2 字体直链"/);
assert.match(settings, /aria-label="全局字体大小"/);
assert.match(runtime, /fontAssetDb\.getFont/);
assert.match(runtime, /--app-font-family/);
assert.match(styles, /font-size: var\(--app-root-font-size\)/);
assert.match(styles, /\[class~="text-\[10px\]"\]/);
assert.match(clearData, /fontAssetDb\.clearAll/);
assert.match(bootstrap, /globalFontSize \/ 16/);

console.log("PASS global font files, direct URL validation, responsive font sizing, persistence, and cleanup");
