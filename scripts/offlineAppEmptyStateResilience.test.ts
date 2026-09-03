import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/components/AppOffline.tsx", "utf8");
const settingsHook = fs.readFileSync("src/features/offline/hooks/useOfflineStorySettings.ts", "utf8");

assert.match(source, /selectedChar \? \[selectedChar\] : \[\]/, "empty character collections must not create an undefined story actor");
assert.match(source, /!selectedChar \? \(/, "the directory must render an explicit no-character state");
assert.match(source, /disabled=\{!selectedChar\}/, "story creation must be disabled without a selected character");
assert.match(source, /showCreateModal && selectedChar &&/, "the creation modal must not render without a selected character");
assert.match(settingsHook, /try \{[\s\S]*JSON\.parse\(raw\)[\s\S]*\} catch/, "legacy custom preset JSON must be parsed defensively");
assert.match(source, /Array\.isArray\(activeStory\?\.messages\)/, "legacy stories with missing messages must not crash the workspace");

console.log("PASS offline app empty-state and legacy-data resilience");
