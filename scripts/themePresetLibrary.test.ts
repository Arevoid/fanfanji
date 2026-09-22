import assert from "node:assert/strict";
import {
  applyThemePresetToRoot,
  resolveThemePreset,
  THIN_STRAWBERRY_PRESET,
  THIN_STRAWBERRY_PRESET_ID,
  THIN_STRAWBERRY_PRESET_NAME,
} from "../src/features/theme/themePresetLibrary";

const rootVars = new Map<string, string>();
const root = {
  dataset: {} as DOMStringMap,
  style: {
    setProperty: (key: string, value: string) => rootVars.set(key, value),
    removeProperty: (key: string) => rootVars.delete(key),
  },
} as unknown as HTMLElement;

assert.equal(THIN_STRAWBERRY_PRESET.id, THIN_STRAWBERRY_PRESET_ID);
assert.equal(THIN_STRAWBERRY_PRESET.name, THIN_STRAWBERRY_PRESET_NAME);
assert.deepEqual(THIN_STRAWBERRY_PRESET.previewColors, ["#ffd3d4", "#d5ebe4", "#f8f4e8", "#775c56"]);
assert.equal(resolveThemePreset(THIN_STRAWBERRY_PRESET_ID, []).id, THIN_STRAWBERRY_PRESET_ID);
assert.equal(resolveThemePreset(THIN_STRAWBERRY_PRESET_NAME, []).id, THIN_STRAWBERRY_PRESET_ID);

applyThemePresetToRoot(THIN_STRAWBERRY_PRESET, "light", root);
assert.equal(root.dataset.themePreset, THIN_STRAWBERRY_PRESET_ID);
assert.equal(rootVars.get("--app-bg"), "#f8f4e8");
assert.equal(rootVars.get("--accent"), "#c98288");

applyThemePresetToRoot(THIN_STRAWBERRY_PRESET, "dark", root);
assert.equal(rootVars.get("--app-bg"), "#2d2524");
assert.equal(rootVars.get("--accent"), "#ffb7bb");

applyThemePresetToRoot(undefined, "light", root);
assert.equal(root.dataset.themePreset, undefined);
assert.equal(rootVars.size, 0);

console.log("PASS thin strawberry theme preset resolves, applies, switches mode, and cleans up");
