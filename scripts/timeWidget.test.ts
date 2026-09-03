import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatChineseLunarDate, formatLunarDay, formatTimeWidgetDate } from "../src/features/home/timeWidgetDate";

const date = new Date(2026, 7, 10, 14, 58, 0);
assert.equal(formatLunarDay(1), "初一");
assert.equal(formatLunarDay(20), "二十");
assert.equal(formatLunarDay(28), "廿八");
assert.equal(formatLunarDay(30), "三十");
assert.equal(formatChineseLunarDate(date), "丙午年六月廿八");
assert.deepEqual(formatTimeWidgetDate(date), {
  time: "14:58",
  heading: "8月10日 星期一 · 丙午年六月廿八",
});

const widgets = readFileSync(new URL("../src/components/HomeScreenWidgets.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
const backup = readFileSync(new URL("../src/features/home/desktopModuleBackup.ts", import.meta.url), "utf8");
assert.match(widgets, /export function TimeWidget/);
assert.match(widgets, /time_widget_font_color_/);
assert.match(widgets, /readString\(`time_widget_font_color_\$\{id\}`\)\.value, "#1c1917"/);
assert.match(widgets, /bg-transparent/);
assert.match(widgets, /items-center justify-center/);
assert.match(widgets, /text-\[clamp\(92px,28vw,118px\)\]/);
assert.match(widgets, /text-\[17px\]/);
assert.match(widgets, /onAdd\("time"\)/);
assert.match(app, /case "time": return TimeWidget/);
assert.match(app, /widgetType === "time"[\s\S]*size = "2x4"/);
assert.match(types, /"calendar-album" \| "time"/);
assert.match(backup, /"time_widget_"/);

console.log("Time widget: lunar date, transparent layout, colour persistence and 2x4 wiring passed");
