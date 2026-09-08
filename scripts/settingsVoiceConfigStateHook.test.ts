import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsVoiceConfigState.ts"), "utf8");
const appSettings = fs.readFileSync(path.join(root, "src/components/AppSettings.tsx"), "utf8");

assert.match(hook, /settings\.minimaxApiKey/);
assert.match(hook, /settings\.mosslandApiEndpoint/);
assert.match(hook, /showMosslandPassword/);
assert.match(hook, /minimaxProxyUrl/);
assert.match(appSettings, /useSettingsVoiceConfigState/);
assert.doesNotMatch(appSettings, /const \[minimaxApiKey, setMinimaxApiKey\] = useState/);

console.log("settings voice config state hook contract passed");
