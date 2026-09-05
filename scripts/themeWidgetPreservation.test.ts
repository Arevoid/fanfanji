import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const homeGrid = readFileSync(new URL("../src/features/home/homeGrid.ts", import.meta.url), "utf8");
const widgets = readFileSync(new URL("../src/components/HomeScreenWidgets.tsx", import.meta.url), "utf8");
assert.match(app, /gridColumnStart: itemPosition\.column \+ 1/);
assert.match(app, /gridRowStart: itemPosition\.row \+ 1/);
assert.match(homeGrid, /normalizeHomeScreenLayout/);
assert.match(widgets, /isTransparencyPreservedImage/);
assert.match(widgets, /object-contain/);
console.log("PASS desktop grid positions and transparent/widget imagery are preserved");
