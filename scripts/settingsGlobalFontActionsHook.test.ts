import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSettings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/settings/hooks/useSettingsGlobalFontActions.ts", import.meta.url), "utf8");

assert.match(appSettings, /useSettingsGlobalFontActions\(/);
assert.doesNotMatch(appSettings, /const handleGlobalFontFile = async/);
assert.doesNotMatch(appSettings, /const handleApplyGlobalFontUrl = async/);
assert.doesNotMatch(appSettings, /const handleResetGlobalFont = async/);
assert.match(hook, /fontAssetDb\.getFont/);
assert.match(hook, /fontAssetDb\.saveFont/);
assert.match(hook, /fontAssetDb\.deleteFont/);
assert.match(hook, /if \(!saved\)/);
assert.match(hook, /URL\.revokeObjectURL/);

console.log("PASS settings global-font actions are isolated behind a behavior-preserving hook");
