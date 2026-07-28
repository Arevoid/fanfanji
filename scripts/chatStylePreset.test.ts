import assert from "node:assert/strict";
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

console.log("chat style preset resolution tests passed");
