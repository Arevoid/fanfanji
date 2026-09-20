import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineStorySettings.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
assert.match(hook, /handleSaveSettings/);
assert.match(hook, /handleCreateCustomPreset/);
assert.match(hook, /writeJson\("offline_custom_style_presets"/);
assert.match(app, /useOfflineStorySettings/);
assert.doesNotMatch(app, /const handleCreateCustomPreset/);
assert.doesNotMatch(hook, /WorldBookSnapshot|worldBookSnapshot/);
assert.doesNotMatch(app, /世界书快照|刷新世界书快照|worldBookSnapshot/);
console.log("PASS offline story settings state and persistence are isolated in a hook");
