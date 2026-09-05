import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const [file, page] of [["../src/components/AppMusic.tsx", "music"], ["../src/components/AppStore.tsx", "store"], ["../src/components/StickerSettings.tsx", "stickers"]]) {
  assert.match(readFileSync(new URL(file, import.meta.url), "utf8"), new RegExp(`data-theme-page=\\"${page}\\"`));
}
const css = readFileSync(new URL("../src/styles/theme-b2.css", import.meta.url), "utf8");
assert.doesNotMatch(css, /filter:\s*(?:invert|grayscale)/i);
console.log("PASS media apps retain images without theme filters");
