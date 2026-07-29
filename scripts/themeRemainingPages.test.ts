import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const [file, page] of [["../src/components/AppNotes.tsx", "notes"], ["../src/components/AppSchedule.tsx", "schedule"]]) {
  assert.match(readFileSync(new URL(file, import.meta.url), "utf8"), new RegExp(`data-theme-page=\\"${page}\\"`));
}
console.log("PASS remaining user-facing utility pages have explicit dark surface paths");
