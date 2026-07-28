import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveActiveChatStylePreset } from "../src/components/AppChat";

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
  /#conv-screen\.style-liquid-glass \.chat-bubble-self \*,/,
  "liquid glass must force readable text inside a self bubble",
);

console.log("chat style preset resolution tests passed");
