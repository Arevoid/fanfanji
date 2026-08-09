import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const button = readFileSync(new URL("../src/components/ui/Button.tsx", import.meta.url), "utf8");
assert.match(source, /<Button[\s\S]*?variant="secondary"[\s\S]*?loading=/);
assert.match(button, /bg-\[var\(--button-secondary-bg\)\]/);
assert.match(button, /text-\[var\(--button-secondary-text\)\]/);
assert.match(button, /disabled:bg-\[var\(--button-disabled-bg\)\]/);
assert.match(button, /disabled:text-\[var\(--button-disabled-text\)\]/);
console.log("PASS offline memory-sync action has readable enabled and disabled semantic button states");
