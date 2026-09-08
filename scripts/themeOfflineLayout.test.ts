import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/components/offline/offlineStory.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
assert.match(css, /grid-template-columns: 40px minmax\(0, 1fr\) 40px/);
assert.match(css, /\.offline-chat-link-card \{ display: flex; min-width: 0/);
assert.match(app, /data-theme-page="offline"/);
console.log("PASS offline navigation and linked-chat layout remain relation-aware UI structure");
