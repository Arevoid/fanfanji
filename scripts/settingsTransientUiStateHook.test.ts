import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsTransientUiState.ts"), "utf8");
const appSettings = fs.readFileSync(path.join(root, "src/components/AppSettings.tsx"), "utf8");

assert.match(hook, /isTesting/);
assert.match(hook, /testResult/);
assert.match(hook, /newPresetName/);
assert.match(appSettings, /useSettingsTransientUiState/);
assert.doesNotMatch(appSettings, /const \[isTesting, setIsTesting\] = useState/);
assert.doesNotMatch(appSettings, /const \[newPresetName, setNewPresetName\] = useState/);

console.log("settings transient UI state hook contract passed");
