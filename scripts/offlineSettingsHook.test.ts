import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineStorySettings.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
assert.match(hook, /handleSaveSettings/);
assert.match(hook, /handleRefreshWorldBookSnapshot/);
assert.match(hook, /handleCreateCustomPreset/);
assert.match(hook, /writeJson\("offline_custom_style_presets"/);
assert.match(app, /useOfflineStorySettings/);
assert.doesNotMatch(app, /const handleCreateCustomPreset/);
console.log("PASS offline story settings state and persistence are isolated in a hook");
