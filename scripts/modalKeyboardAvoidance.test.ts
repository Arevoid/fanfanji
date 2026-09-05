import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modal = readFileSync(new URL("../src/components/ui/Modal.tsx", import.meta.url), "utf8");
const sheet = readFileSync(new URL("../src/components/ui/BottomSheet.tsx", import.meta.url), "utf8");
const forum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const offline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const index = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

for (const source of [modal, sheet]) {
  assert.match(source, /app-viewport-overlay/);
  assert.match(source, /var\(--app-viewport-height, 100dvh\)/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
}
assert.match(forum, /data-keyboard-safe-composer/);
assert.match(offline, /offline-page[\s\S]*w-full h-full min-h-0 flex flex-col/);
assert.match(offline, /app-viewport-overlay[\s\S]*fixed inset-x-0 top-0 z-50/);
assert.match(index, /\.phone-screen-container \.fixed\.inset-0/);

console.log("PASS modal, bottom sheet, forum, and offline input surfaces share the keyboard-safe viewport contract");
