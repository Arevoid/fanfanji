import assert from "node:assert/strict";
import {
  CLASSIC_BUBBLE_PALETTE_MIGRATION_VERSION,
  CLASSIC_BUBBLE_PRESET_NAME,
  LEGACY_CLASSIC_BUBBLE_CSS,
  migrateLegacyClassicBubblePreset,
  migrateUnreadableClassicBubblePalette,
} from "../src/features/chat/styles/classicBubblePreset";
import type { UserSettings } from "../src/types";

const base = {
  activePreset: CLASSIC_BUBBLE_PRESET_NAME,
  bubbleCss: LEGACY_CLASSIC_BUBBLE_CSS,
  selfBubbleBg: "#ffb6c1",
  selfBubbleColor: "#ffffff",
  otherBubbleBg: "#000000",
  otherBubbleColor: "#ffffff",
  bubbleTailEnabled: false,
} as UserSettings;

const migrated = migrateLegacyClassicBubblePreset(base);
assert.equal(migrated.migrated, true);
assert.equal(migrated.settings.bubbleCss, "");
assert.equal(migrated.settings.activePreset, "手动调色");
assert.equal(migrated.settings.selfBubbleBg, "#ffb6c1");
assert.equal(migrated.settings.otherBubbleBg, "#000000");
assert.equal(migrated.settings.bubbleTailEnabled, false);
assert.equal(migrateLegacyClassicBubblePreset(migrated.settings).migrated, false);

const presetOnly = migrateLegacyClassicBubblePreset({
  activePreset: CLASSIC_BUBBLE_PRESET_NAME,
  bubbleCss: LEGACY_CLASSIC_BUBBLE_CSS,
} as UserSettings);
assert.equal(presetOnly.settings.selfBubbleBg, "#3b82f6");
assert.equal(presetOnly.settings.otherBubbleBg, "#e2e8f0");
assert.equal(presetOnly.settings.selfBubbleRadius, 18);
assert.equal(presetOnly.settings.bubbleTailEnabled, false);

const customCss = ".chat-bubble-self { background: hotpink !important; }";
const custom = migrateLegacyClassicBubblePreset({ ...base, bubbleCss: customCss });
assert.equal(custom.migrated, false);
assert.equal(custom.settings.bubbleCss, customCss);

const differentlyNamed = migrateLegacyClassicBubblePreset({ ...base, activePreset: "我的自定义预设" });
assert.equal(differentlyNamed.migrated, false);
assert.equal(differentlyNamed.settings.bubbleCss, LEGACY_CLASSIC_BUBBLE_CSS);

const unreadable = migrateUnreadableClassicBubblePalette({
  ...base,
  otherBubbleBg: "#ffffff",
  otherBubbleColor: "#fff",
  classicBubblePaletteMigrationVersion: undefined,
});
assert.equal(unreadable.migrated, true);
assert.equal(unreadable.settings.otherBubbleColor, "#18181b");
assert.equal(unreadable.settings.classicBubblePaletteMigrationVersion, CLASSIC_BUBBLE_PALETTE_MIGRATION_VERSION);
assert.equal(migrateUnreadableClassicBubblePalette(unreadable.settings).migrated, false);

const readableCustomization = migrateUnreadableClassicBubblePalette({
  ...base,
  otherBubbleBg: "#000000",
  otherBubbleColor: "#ffffff",
  classicBubblePaletteMigrationVersion: undefined,
});
assert.equal(readableCustomization.migrated, false);
assert.equal(readableCustomization.settings.otherBubbleColor, "#ffffff");

console.log("classic bubble preset migration tests passed");
