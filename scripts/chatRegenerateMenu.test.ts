import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const regenerationHook = readFileSync(new URL("../src/features/chat/hooks/useChatRegenerationAction.ts", import.meta.url), "utf8");

const longPressMenuStart = appChat.indexOf("Long Press Bubble Context Menu");
assert.notEqual(longPressMenuStart, -1, "long-press message menu should remain present");
const longPressMenu = appChat.slice(longPressMenuStart);
const regenerateEntryStart = longPressMenu.indexOf("<span>重回</span>");
assert.notEqual(regenerateEntryStart, -1, "long-press menu should expose 重回");
const regenerateEntry = longPressMenu.slice(Math.max(0, regenerateEntryStart - 650), regenerateEntryStart + 80);
assert.match(regenerateEntry, /activeMenuMsg\.sender !== "user"/);
assert.match(regenerateEntry, /void handleRegenerateResponse\(targetMsg\)/);
assert.match(regenerateEntry, /<RefreshCw/);

assert.match(regenerationHook, /oocComment = ""/);
assert.match(regenerationHook, /if \(oocComment\.trim\(\)\)/);

console.log("PASS long-press character bubbles expose the shared AI regeneration action");
