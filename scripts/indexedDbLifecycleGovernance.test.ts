import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  "src/utils/imageAssetDb.ts",
  "src/utils/stickerDb.ts",
  "src/utils/audioDb.ts",
  "src/utils/fontAssetDb.ts",
];

for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(source, /attachIndexedDbLifecycle/);
  assert.match(source, /this\.db = null/);
}

const lifecycle = readFileSync(new URL("../src/core/storage/idbLifecycle.ts", import.meta.url), "utf8");
assert.match(lifecycle, /onversionchange/);
assert.match(lifecycle, /onclose/);
console.log("PASS resource IndexedDB clients reset cached handles on version changes and closes");
