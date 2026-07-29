import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/features/moments/MomentsApp.tsx", import.meta.url), "utf8");
assert.match(source, /moment-media-placeholder/);
assert.match(source, /media-placeholder-bg/);
assert.match(source, /media-placeholder-text/);
assert.match(source, /moment\.image.*object-contain/s);
assert.doesNotMatch(source, /moment\.image[^\n]*filter-/);
console.log("PASS Moments text-image placeholder is semantic while real images remain unfiltered");
