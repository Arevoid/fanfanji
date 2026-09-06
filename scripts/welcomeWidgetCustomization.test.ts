import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const widgets = readFileSync(new URL("../src/components/HomeScreenWidgets.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/features/home/welcomeWidgetProfile.ts", import.meta.url), "utf8");
const welcomeStart = widgets.indexOf("export function WelcomeWidget");
const albumStart = widgets.indexOf("export function AlbumWidget");
const calendarStart = widgets.indexOf("export function CalendarAlbumWidget");
assert.ok(welcomeStart >= 0 && albumStart > welcomeStart && calendarStart > albumStart);

const welcomeSource = widgets.slice(welcomeStart, albumStart);
const albumSource = widgets.slice(albumStart, calendarStart);

assert.match(profile, /welcome_widget_avatar_\$\{id\}/);
assert.match(profile, /welcome_widget_name_\$\{id\}/);
assert.match(profile, /welcome_widget_signature_\$\{id\}/);
assert.match(welcomeSource, /loadWelcomeWidgetProfile\(id, activeIdentity\)/);
assert.match(welcomeSource, /saveWelcomeWidgetProfile\(id, draft\)/);
assert.match(welcomeSource, /独立于“我的人设”/);
assert.match(welcomeSource, /onClick=\{openSettings\}/);
assert.match(welcomeSource, /上传头像/);
assert.match(welcomeSource, /个性签名/);

// A 2x2 photo widget should dim only its surrounding card surface. The
// image itself must remain fully opaque at every widget-opacity setting.
assert.match(albumSource, /backgroundColor: isTransparentPhoto \? "transparent" : `rgba/);
assert.doesNotMatch(albumSource, /<img[\s\S]*?style=\{\{\s*opacity:/);

console.log("welcome widget isolation and album image opacity tests passed");
