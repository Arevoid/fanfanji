import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

assert.match(source, /这是一次线上音乐分享聊天/);
assert.match(source, /禁止为了回应这次分享而补写地点、动作或双方共同场景/);

console.log("music share plain-chat safeguards passed");
