import assert from "node:assert/strict";
import { serializeMessageContentForPrompt } from "../src/features/chat/prompts/messagePromptSerializer";

const prompt = serializeMessageContentForPrompt({
  id: "music-share",
  characterId: "character-1",
  sender: "user",
  content: "[音乐]|晴天|周杰伦",
  timestamp: Date.now(),
}, { mode: "current" });

assert.match(prompt, /这是线上音乐分享/);
assert.match(prompt, /禁止为了回应这次分享而补写地点、动作或双方共同场景/);

console.log("music share plain-chat safeguards passed");
