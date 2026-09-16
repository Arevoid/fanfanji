import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { updateTextApiPresetDraft } from "../src/features/settings/hooks/textApiPresetDraft";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsApiPresetState.ts"), "utf8");
const appSettings = fs.readFileSync(path.join(root, "src/components/AppSettings.tsx"), "utf8");
const textApiActions = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsTextApiActions.ts"), "utf8");

assert.match(hook, /settings\.apiPresets/);
assert.match(hook, /settings\.imageApiPresets/);
assert.match(hook, /selectedModel: preset\.selectedModel/);
assert.match(hook, /apiKey/);
assert.match(appSettings, /useSettingsApiPresetState/);
assert.doesNotMatch(appSettings, /const \[apiPresets, setApiPresets\] = useState/);
assert.doesNotMatch(appSettings, /const \[imageApiPresets, setImageApiPresets\] = useState/);
assert.match(textApiActions, /if \(!saved\)/);
assert.match(textApiActions, /presetsWithDraft/);
assert.match(hook, /lastAppliedTextPresetSettings/);

const presets = [
  { id: "a", name: "A", apiEndpoint: "https://a", apiKey: "key-a", selectedModel: "model-a", apiTemperature: 0.5, streamCompatible: false },
  { id: "b", name: "B", apiEndpoint: "https://b", apiKey: "key-b", selectedModel: "model-b", apiTemperature: 0.7, streamCompatible: true },
];
const switched = updateTextApiPresetDraft(presets, "a", {
  name: "A edited", apiEndpoint: "https://edited-a", apiKey: "new-key-a", selectedModel: "model-edited-a", apiTemperature: 1.2, streamCompatible: true,
});
assert.deepEqual(switched[0], {
  id: "a", name: "A edited", apiEndpoint: "https://edited-a", apiKey: "new-key-a", selectedModel: "model-edited-a", apiTemperature: 1.2, streamCompatible: true,
});
assert.deepEqual(switched[1], presets[1], "switching a preset must leave other presets untouched");
assert.equal(updateTextApiPresetDraft(presets, "missing", switched[0]), presets, "unknown preset IDs must not mutate preset state");

console.log("settings API preset save and draft preservation contract passed");
