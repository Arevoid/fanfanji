import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const b1 = readFileSync(new URL("../src/styles/theme-b1.css", import.meta.url), "utf8");

assert.match(settings, /data-settings-shell/);
assert.match(settings, /bg-neutral-950/);
assert.match(b1, /\[data-settings-shell\].*\.bg-white/s);
assert.match(b1, /\[data-settings-shell\].*\.text-slate-500/s);
assert.match(b1, /\[data-settings-shell\].*button:is\(.bg-neutral-950/);
assert.match(b1, /\[data-settings-shell\].*button:disabled/s);
console.log("PASS settings memory cards, sliders and manual archive controls inherit scoped semantic dark surfaces");
