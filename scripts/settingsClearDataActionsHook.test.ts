import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/settings/hooks/useSettingsClearDataActions.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");

assert.match(hook, /clearApplicationData/);
assert.match(hook, /无法恢复/);
assert.match(hook, /window\.location\.reload/);
assert.match(settings, /useSettingsClearDataActions/);
assert.doesNotMatch(settings, /const handleClearApplicationData =/);

console.log("PASS settings clear-data actions are isolated behind its hook");
