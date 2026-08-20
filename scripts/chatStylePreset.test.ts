import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveActiveChatStylePreset } from "../src/features/chat/styles/chatStylePreset";

assert.equal(
  resolveActiveChatStylePreset("default", "liquid-glass"),
  "liquid-glass",
  "legacy character default must inherit the global liquid-glass setting",
);
assert.equal(
  resolveActiveChatStylePreset(undefined, "liquid-glass"),
  "liquid-glass",
  "characters without an override must inherit the global setting",
);
assert.equal(
  resolveActiveChatStylePreset("floating-cute", "liquid-glass"),
  "floating-cute",
  "an explicit non-default character style remains an override",
);
assert.equal(resolveActiveChatStylePreset("default", undefined), "default");

const appChatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const appSettingsSource = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
assert.match(
  appChatSource,
  /background: radial-gradient\(circle at 12% 8%, #ffffff 0%, #f3f7fb 42%, #e7eef7 100%\) !important;/,
  "liquid glass without a wallpaper must use an opaque base rather than expose the chat list beneath it",
);
assert.match(
  appChatSource,
  /#conv-screen\.style-liquid-glass \.chat-bubble-self,/,
  "liquid glass bubble rules must match the ID specificity of saved bubble colors",
);
assert.match(
  appChatSource,
  /#conv-screen\.style-liquid-glass \.chat-bubble-self > \.chat-message--voice-duration,/,
  "liquid glass must target semantic message children instead of every bubble descendant",
);
assert.doesNotMatch(
  appChatSource,
  /chat-bubble-(?:self|other)\s+\*/,
  "bubble theme rules must not leak into quotes, payments, or other nested special content",
);
for (const sharedDefault of [
  "CLASSIC_SELF_BUBBLE_BACKGROUND",
  "CLASSIC_SELF_BUBBLE_TEXT",
  "CLASSIC_OTHER_BUBBLE_BACKGROUND",
  "CLASSIC_OTHER_BUBBLE_TEXT",
]) {
  assert.match(appChatSource, new RegExp(sharedDefault), `${sharedDefault} must drive the rendered chat`);
  assert.match(appSettingsSource, new RegExp(sharedDefault), `${sharedDefault} must drive the settings preview`);
}
assert.doesNotMatch(
  appChatSource,
  /settings\.selfBubbleBg\s*\?[^;]+var\(--button-primary-bg\)/s,
  "an unset saved colour must not fall back to the unrelated blue primary-button token",
);

console.log("chat style preset resolution tests passed");
