import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/components/offline/offlineStory.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
assert.match(css, /grid-template-columns: 44px minmax\(0, 1fr\) 44px/);
assert.match(css, /--offline-page-bg-image/);
assert.match(css, /\.offline-page :is\(\.offline-story-directory, \.offline-story-workspace\)/);
assert.match(css, /\.offline-chat-link-card \{ display: flex; min-width: 0/);
assert.match(app, /data-theme-page="offline"/);
console.log("PASS offline navigation and linked-chat layout remain relation-aware UI structure");
