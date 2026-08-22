import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/components/AppReading.tsx", import.meta.url),
  "utf8",
);

assert.match(source, /aria-label=\{`编辑\$\{quickEditBook\.title\}`\}/);
assert.match(source, /fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain/);
assert.match(source, /max-h-\[calc\(100dvh-1\.5rem\)\].*overflow-y-auto overscroll-contain/);

console.log("reading book edit UI checks passed");
