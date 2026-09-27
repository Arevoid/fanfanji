import assert from "node:assert/strict";
import {
  applyThemePresetToRoot,
  resolveThemePreset,
  BERRY_GRID_PRESET,
  BERRY_GRID_PRESET_ID,
  BERRY_GRID_PRESET_NAME,
} from "../src/features/theme/themePresetLibrary";

const rootVars = new Map<string, string>();
const root = {
  dataset: {} as DOMStringMap,
  style: {
    setProperty: (key: string, value: string) => rootVars.set(key, value),
    removeProperty: (key: string) => rootVars.delete(key),
  },
} as unknown as HTMLElement;

assert.equal(BERRY_GRID_PRESET.id, BERRY_GRID_PRESET_ID);
assert.equal(BERRY_GRID_PRESET.name, BERRY_GRID_PRESET_NAME);
assert.deepEqual(BERRY_GRID_PRESET.previewColors, ["#eee5e4", "#fffdfc", "#e8b5be", "#756b70"]);
assert.match(BERRY_GRID_PRESET.wallpaper, /repeating-linear-gradient/);
assert.match(BERRY_GRID_PRESET.globalCss, /app-icon-surface/);
assert.match(BERRY_GRID_PRESET.globalCss, /dock-container/);
assert.equal(resolveThemePreset(BERRY_GRID_PRESET_ID, []).id, BERRY_GRID_PRESET_ID);
assert.equal(resolveThemePreset(BERRY_GRID_PRESET_NAME, []).id, BERRY_GRID_PRESET_ID);
assert.equal(resolveThemePreset("p-thin-strawberry", []).id, BERRY_GRID_PRESET_ID);
assert.equal(resolveThemePreset("薄巧莓莓", []).id, BERRY_GRID_PRESET_ID);

applyThemePresetToRoot(BERRY_GRID_PRESET, "light", root);
assert.equal(root.dataset.themePreset, BERRY_GRID_PRESET_ID);
assert.equal(rootVars.get("--app-bg"), "#eee5e4");
assert.equal(rootVars.get("--accent"), "#d295a0");
assert.equal(rootVars.get("--nav-bg"), "#eee5e4");
assert.equal(rootVars.get("--nav-text"), "#514b4e");

applyThemePresetToRoot(BERRY_GRID_PRESET, "dark", root);
assert.equal(rootVars.get("--app-bg"), "#2d282a");
assert.equal(rootVars.get("--accent"), "#f0aeb8");
assert.equal(rootVars.get("--nav-bg"), "#2d282a");
assert.equal(rootVars.get("--nav-text"), "#fff3f1");

applyThemePresetToRoot(undefined, "light", root);
assert.equal(root.dataset.themePreset, undefined);
assert.equal(rootVars.size, 0);

console.log("PASS berry grid theme preset resolves, applies, switches mode, migrates, and cleans up");
