import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsApiPresetState.ts"), "utf8");
const appSettings = fs.readFileSync(path.join(root, "src/components/AppSettings.tsx"), "utf8");

assert.match(hook, /settings\.apiPresets/);
assert.match(hook, /settings\.imageApiPresets/);
assert.match(hook, /selectedModel: preset\.selectedModel/);
assert.match(hook, /apiKey/);
assert.match(appSettings, /useSettingsApiPresetState/);
assert.doesNotMatch(appSettings, /const \[apiPresets, setApiPresets\] = useState/);
assert.doesNotMatch(appSettings, /const \[imageApiPresets, setImageApiPresets\] = useState/);

console.log("settings API preset state hook contract passed");
