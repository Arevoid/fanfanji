import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/components/offline/offlineStory.css", import.meta.url), "utf8");
assert.match(app, /--offline-reading-text.*var\(--text-primary\)/s);
assert.match(app, /--offline-reading-card.*var\(--surface\)/s);
assert.match(css, /\.offline-raw-content :is\(p, strong, b, blockquote, span\) \{\s*color: inherit;/);
assert.match(css, /offline-chat-link-card/);
console.log("PASS offline story defaults resolve to semantic foreground and surface tokens");
