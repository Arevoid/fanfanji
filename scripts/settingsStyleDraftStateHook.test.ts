import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsStyleDraftState.ts"), "utf8");
const appSettings = fs.readFileSync(path.join(root, "src/components/AppSettings.tsx"), "utf8");

assert.match(hook, /settings\.wallpaper/);
assert.match(hook, /settings\.chatGlobalCSS/);
assert.match(hook, /sanitizeGlobalFontSize/);
assert.match(hook, /fontOperationPending/);
assert.match(appSettings, /useSettingsStyleDraftState/);
assert.doesNotMatch(appSettings, /const \[wallpaper, setWallpaper\] = useState/);
assert.doesNotMatch(appSettings, /const \[globalFontSize, setGlobalFontSize\] = useState/);

console.log("settings style draft state hook contract passed");
