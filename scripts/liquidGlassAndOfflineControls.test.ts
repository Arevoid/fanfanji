import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyLiquidGlassTextDefaults, LIQUID_GLASS_DEFAULT_TEXT_COLOR } from "../src/features/chat/styles/liquidGlassDefaults";
import type { UserSettings } from "../src/types";

const base = {
  name: "用户", avatar: "", signature: "", bio: "", apiKey: "", selectedModel: "",
  wallpaper: "", customIcons: {}, bubbleCss: "", globalCss: "", activePreset: "",
} as UserSettings;

const firstUse = applyLiquidGlassTextDefaults({ ...base, globalChatStylePreset: "liquid-glass", selfBubbleColor: "#ffffff", otherBubbleColor: "#ffffff" });
assert.equal(firstUse.selfBubbleColor, LIQUID_GLASS_DEFAULT_TEXT_COLOR);
assert.equal(firstUse.otherBubbleColor, LIQUID_GLASS_DEFAULT_TEXT_COLOR);
assert.equal(firstUse.liquidGlassTextDefaultsApplied, true);

const customized = { ...firstUse, selfBubbleColor: "#ff00ff", otherBubbleColor: "#00ffff" };
assert.equal(applyLiquidGlassTextDefaults(customized), customized, "later user colours must never be reset");

const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const offline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
assert.match(chat, /\.style-liquid-glass \.chat-bubble-self \* \{[\s\S]*?color: #1c1917 !important;/);
assert.match(chat, /\.style-liquid-glass \.chat-bubble-other \* \{[\s\S]*?color: #1c1917 !important;/);
assert.match(offline, /absolute left-0\.5 top-0\.5/);
assert.match(offline, /translate-x-5/);
assert.match(settings, /全局聊天样式 CSS/);
assert.match(settings, /copyGlobalChatCssTemplate/);
assert.match(settings, /复制模板/);

console.log("PASS liquid-glass first-use colours, offline toggle alignment, and global CSS template control");
