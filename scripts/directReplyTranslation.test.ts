import assert from "node:assert/strict";
import { ensureDirectReplyTranslation } from "../src/features/chat/services/directReplyTranslation";

const settings = { apiKey: "key", selectedModel: "model", apiEndpoint: "https://provider.test/v1" };
let calls = 0;
const translated = await ensureDirectReplyTranslation(
  { text: "hello" },
  { enabled: true, settings, translate: async (input) => { calls += 1; assert.equal(input.text, "hello"); return { text: "你好" }; } },
);
assert.equal(translated.translation, "你好");
assert.equal(calls, 1);

const existing = await ensureDirectReplyTranslation(
  { text: "hello", translation: "已有译文" },
  { enabled: true, settings, translate: async () => { throw new Error("must not call"); } },
);
assert.equal(existing.translation, "已有译文");

const failed = await ensureDirectReplyTranslation(
  { text: "hello" },
  { enabled: true, settings, translate: async () => { throw new Error("provider unavailable"); } },
);
assert.equal(failed.translation, undefined, "translation failure must preserve the original reply");

console.log("PASS direct-reply automatic translation fallback contract");
