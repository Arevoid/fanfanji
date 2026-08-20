import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsAppearanceDraftState.ts"), "utf8");
const appSettings = fs.readFileSync(path.join(root, "src/components/AppSettings.tsx"), "utf8");

assert.match(hook, /effectiveBubbleStylePreset/);
assert.match(hook, /liquidGlassBubbleTailEnabled/);
assert.match(hook, /otherBubbleBorderColor/);
assert.match(hook, /beautySubTab/);
assert.match(appSettings, /useSettingsAppearanceDraftState/);
assert.doesNotMatch(appSettings, /const \[dockOpacity, setDockOpacity\] = useState/);
assert.doesNotMatch(appSettings, /const \[otherBubbleBg, setOtherBubbleBg\] = useState/);

console.log("settings appearance draft state hook contract passed");
