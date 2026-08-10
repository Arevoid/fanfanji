import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyLiquidGlassTextDefaults,
  LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
  LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
  LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS,
  LIQUID_GLASS_DEFAULT_TEXT_COLOR,
} from "../src/features/chat/styles/liquidGlassDefaults";
import type { UserSettings } from "../src/types";

const base = {
  name: "用户", avatar: "", signature: "", bio: "", apiKey: "", selectedModel: "",
  wallpaper: "", customIcons: {}, bubbleCss: "", globalCss: "", activePreset: "",
} as UserSettings;

const firstUse = applyLiquidGlassTextDefaults({ ...base, globalChatStylePreset: "liquid-glass", selfBubbleColor: "#ffffff", otherBubbleColor: "#ffffff" });
assert.equal(firstUse.selfBubbleColor, "#ffffff", "classic palette must remain unchanged");
assert.equal(firstUse.otherBubbleColor, "#ffffff", "classic palette must remain unchanged");
assert.equal(firstUse.liquidGlassSelfBubbleColor, LIQUID_GLASS_DEFAULT_TEXT_COLOR);
assert.equal(firstUse.liquidGlassOtherBubbleColor, LIQUID_GLASS_DEFAULT_TEXT_COLOR);
assert.equal(firstUse.liquidGlassSelfBubbleBg, LIQUID_GLASS_DEFAULT_BUBBLE_COLOR);
assert.equal(firstUse.liquidGlassOtherBubbleBg, LIQUID_GLASS_DEFAULT_BUBBLE_COLOR);
assert.equal(firstUse.liquidGlassSelfBubbleOpacity, LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY);
assert.equal(firstUse.liquidGlassOtherBubbleOpacity, LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY);
assert.equal(firstUse.liquidGlassSelfBubbleRadius, LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS);
assert.equal(firstUse.liquidGlassOtherBubbleRadius, LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS);
assert.equal(firstUse.liquidGlassBubbleTailEnabled, false);
assert.equal(firstUse.liquidGlassBubbleBorderEnabled, false);
assert.equal(firstUse.liquidGlassTextDefaultsApplied, true);
assert.equal(firstUse.liquidGlassVisualDefaultsApplied, true);

const customized = {
  ...firstUse,
  liquidGlassSelfBubbleBg: "#ff00ff",
  liquidGlassSelfBubbleColor: "#123456",
  liquidGlassOtherBubbleColor: "#00ffff",
};
assert.equal(applyLiquidGlassTextDefaults(customized), customized, "later user colours must never be reset");

const repairedLegacy = applyLiquidGlassTextDefaults({
  ...base,
  globalChatStylePreset: "liquid-glass",
  liquidGlassTextDefaultsApplied: true,
  selfBubbleBg: "#18181b",
  otherBubbleBg: "#f4f4f5",
  selfBubbleColor: LIQUID_GLASS_DEFAULT_TEXT_COLOR,
  otherBubbleColor: LIQUID_GLASS_DEFAULT_TEXT_COLOR,
  selfBubbleOpacity: 100,
  otherBubbleOpacity: 100,
});
assert.equal(repairedLegacy.selfBubbleBg, "#18181b");
assert.equal(repairedLegacy.otherBubbleBg, "#f4f4f5");
assert.equal(repairedLegacy.selfBubbleColor, "#ffffff", "the old migration's black-on-black classic text must be repaired");
assert.equal(repairedLegacy.otherBubbleColor, "#18181b");
assert.equal(repairedLegacy.liquidGlassSelfBubbleBg, LIQUID_GLASS_DEFAULT_BUBBLE_COLOR);
assert.equal(repairedLegacy.liquidGlassOtherBubbleBg, LIQUID_GLASS_DEFAULT_BUBBLE_COLOR);

const preservedLegacyCustomization = applyLiquidGlassTextDefaults({
  ...repairedLegacy,
  liquidGlassVisualDefaultsApplied: undefined,
  liquidGlassSelfBubbleBg: "#fde68a",
});
assert.equal(preservedLegacyCustomization.liquidGlassSelfBubbleBg, "#fde68a", "existing customized glass colours must be preserved during repair");

const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const offline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
assert.match(chat, /settings\.liquidGlassSelfBubbleBg \|\| LIQUID_GLASS_DEFAULT_BUBBLE_COLOR/);
assert.match(chat, /settings\.liquidGlassOtherBubbleBg \|\| LIQUID_GLASS_DEFAULT_BUBBLE_COLOR/);
assert.match(chat, /settings\.liquidGlassSelfBubbleColor \|\| LIQUID_GLASS_DEFAULT_TEXT_COLOR/);
assert.match(chat, /settings\.liquidGlassOtherBubbleColor \|\| LIQUID_GLASS_DEFAULT_TEXT_COLOR/);
assert.match(chat, /!isLiquidGlass && settings\.selfBubbleBg/);
assert.match(chat, /!isLiquidGlass && settings\.otherBubbleBg/);
assert.match(chat, /settings\.liquidGlassSelfBubbleRadius \?\? LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS/);
assert.match(chat, /settings\.liquidGlassOtherBubbleRadius \?\? LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS/);
assert.match(settings, /getPreviewBubbleVisualStyle\("self"\)/);
assert.match(settings, /getPreviewBubbleVisualStyle\("other"\)/);
assert.match(settings, /液态玻璃气泡设置/);
assert.match(settings, /\{ liquidGlassSelfBubbleRadius: val \}/);
assert.match(settings, /\{ selfBubbleRadius: val \}/);
assert.match(settings, /\{ liquidGlassBubbleBorderEnabled: nextVal \}/);
assert.match(settings, /\{ bubbleBorderEnabled: nextVal \}/);
assert.match(offline, /absolute left-0\.5 top-0\.5/);
assert.match(offline, /translate-x-5/);
assert.match(settings, /全局聊天样式 CSS/);
assert.match(settings, /copyGlobalChatCssTemplate/);
assert.match(settings, /复制模板/);

console.log("PASS liquid-glass first-use colours, offline toggle alignment, and global CSS template control");
