import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCharacterImagePrompt } from "../src/domain/prompt/characterImagePrompt";

const prompt = buildCharacterImagePrompt({
  character: { id: "char", name: "祁澈", avatar: "", personality: "冷静", backstory: "", imageAppearancePrompt: "黑发，白衬衫", imageNegativePrompt: "水印" },
  relationship: { id: "rel-a", characterId: "char", userIdentityId: "user-a", conversationId: "direct:rel-a", relationship: "partner", createdAt: 1, updatedAt: 1 },
  recentMessages: [{ id: "m", characterId: "char", relationId: "rel-a", sender: "user", content: "给我发张照片", timestamp: 1 }],
  userRequest: "给我发张照片",
});
assert.match(prompt, /黑发，白衬衫/);
assert.match(prompt, /Avoid: 水印/);
assert.match(prompt, /Current relationship context only: partner/);
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
assert.match(server, /\/images\/generations/);
assert.match(server, /\/images\/edits/);
assert.match(server, /trigger !== "manual"/);
assert.doesNotMatch(server, /apiChat\(.*image/s);
console.log("imageApiPayload.test passed");
