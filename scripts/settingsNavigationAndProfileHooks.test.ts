import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appSettings = fs.readFileSync(path.join(root, "src/components/AppSettings.tsx"), "utf8");
const navigation = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsNavigationState.ts"), "utf8");
const profile = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsProfileDraftState.ts"), "utf8");

assert.match(navigation, /SettingsTab/);
assert.match(profile, /settings\.name/);
assert.match(profile, /settings\.avatar/);
assert.match(profile, /settings\.signature/);
assert.match(profile, /settings\.bio/);
assert.match(appSettings, /useSettingsNavigationState/);
assert.match(appSettings, /useSettingsProfileDraftState/);
assert.doesNotMatch(appSettings, /const \[activeTab, setActiveTab\] = useState/);
assert.doesNotMatch(appSettings, /const \[name, setName\] = useState/);

console.log("settings navigation and profile hook contracts passed");
