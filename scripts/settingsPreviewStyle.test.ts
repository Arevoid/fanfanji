import { strict as assert } from "node:assert";
import { getSettingsPreviewBubbleBackground, getSettingsPreviewBubbleStyle } from "../src/features/settings/settingsPreviewStyle";

assert.equal(getSettingsPreviewBubbleBackground("#123456", 50), "rgba(18, 52, 86, 0.5)");
assert.equal(getSettingsPreviewBubbleBackground("#abc", 150), "rgba(170, 187, 204, 1.5)");
assert.equal(getSettingsPreviewBubbleBackground("not-a-color", 50), "not-a-color");

const normal = getSettingsPreviewBubbleStyle({ background: "rgba(1, 2, 3, .5)", color: "#111", radius: 14, borderEnabled: true, borderWidth: 2, borderColor: "#abc", liquidGlass: false });
assert.equal(normal.background, "rgba(1, 2, 3, .5)");
assert.equal(normal.border, "2px solid #abc");
assert.equal(normal.borderRadius, "14px");
const glass = getSettingsPreviewBubbleStyle({ background: "#fff", color: "#000", radius: 20, borderEnabled: false, borderWidth: 1, borderColor: "#000", liquidGlass: true });
assert.equal(glass.border, "1.5px solid rgba(255, 255, 255, 0.55)");
assert.equal(glass.backdropFilter, "blur(20px) saturate(190%)");
assert.equal(glass.boxShadow, "0 8px 32px rgba(0, 0, 0, 0.04)");

console.log("Settings preview style: border and liquid-glass contracts passed");
