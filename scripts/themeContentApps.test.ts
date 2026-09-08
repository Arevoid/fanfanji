import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pages = [
  ["../src/components/AppArchives.tsx", "archives"],
  ["../src/components/AppWorldBook.tsx", "worldbook"],
  ["../src/components/AppMemory.tsx", "memory"],
  ["../src/components/AppOffline.tsx", "offline"],
  ["../src/features/moments/MomentsApp.tsx", "moments"],
];
for (const [file, page] of pages) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.match(source, new RegExp(`data-theme-page=\\"${page}\\"`));
}
assert.match(readFileSync(new URL("../src/components/offline/offlineStory.css", import.meta.url), "utf8"), /\[data-theme="dark"\] \.offline-page/);
console.log("PASS content app roots retain scoped theme paths");
