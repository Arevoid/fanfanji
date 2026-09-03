import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const indexCss = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const viewport = readFileSync(new URL("../src/features/viewport/visualViewport.ts", import.meta.url), "utf8");

assert.match(indexHtml, /<meta name="viewport"[^>]*viewport-fit=cover/);
assert.equal((indexHtml.match(/<meta name="viewport"/g) || []).length, 1);
assert.match(indexCss, /height: var\(--app-viewport-height, 100dvh\)/);
assert.match(indexCss, /\.app-viewport-root[\s\S]*min-height: 0/);
assert.match(app, /useVisualViewport\(\)/);
assert.match(app, /top:[\s\S]*var\(--app-viewport-offset-top, 0px\)/);
assert.match(viewport, /visualViewport\?\.addEventListener\("resize"/);
assert.match(viewport, /visualViewport\?\.addEventListener\("scroll"/);
assert.match(viewport, /window\.addEventListener\("orientationchange"/);
assert.match(viewport, /visualViewport\?\.removeEventListener\("resize"/);
assert.match(viewport, /visualViewport\?\.removeEventListener\("scroll"/);
assert.match(viewport, /window\.removeEventListener\("orientationchange"/);
assert.match(viewport, /requestAnimationFrame\(applyMetrics\)/);
assert.match(viewport, /metricsEqual/);
assert.doesNotMatch(viewport, /scrollIntoView/);
assert.doesNotMatch(viewport, /addEventListener\("focusin"/);
assert.doesNotMatch(viewport, /localStorage/);

console.log("PASS root layout follows the visual viewport without globally scrolling focused fields");
