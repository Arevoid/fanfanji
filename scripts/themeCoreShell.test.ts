import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/theme-b1.css", import.meta.url), "utf8");
assert.match(app, /data-app-shell/);
assert.match(css, /\[data-app-shell\]/);
assert.match(css, /\.dock-container/);
assert.match(css, /\.home-screen-drag-surface/);
assert.doesNotMatch(css, /filter:\s*invert/i);
console.log("PASS theme core shell, dock, drag surface and no image inversion");
