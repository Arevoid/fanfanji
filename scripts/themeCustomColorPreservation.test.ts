import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const widgets = readFileSync(new URL("../src/components/HomeScreenWidgets.tsx", import.meta.url), "utf8");
assert.match(app, /settings\.dockColor/);
assert.match(app, /settings\.desktopAppTextColor/);
assert.match(app, /settings\.bubbleCss/);
assert.match(widgets, /calendar_album_font_color_/);
assert.match(widgets, /anniversary_color_/);
assert.match(widgets, /backgroundImage/);
assert.doesNotMatch(widgets, /bgImage && <div className="absolute inset-0 bg-black\/40/);
console.log("PASS user dock, bubble, calendar and anniversary colours/images stay user-owned");
