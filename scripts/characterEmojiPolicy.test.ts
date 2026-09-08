import assert from "node:assert/strict";
import { mayCharacterUseEmoji, suppressCharacterEmoji } from "../src/features/chat/services/characterEmojiPolicy";

assert.equal(mayCharacterUseEmoji({ latestUserMessage: "今天好累", recentCharacterMessages: [] }), false);
assert.equal(mayCharacterUseEmoji({ latestUserMessage: "哈哈😂", recentCharacterMessages: [] }), true);
assert.equal(mayCharacterUseEmoji({ latestUserMessage: "哈哈😂", recentCharacterMessages: ["我也😂"] }), false);
assert.equal(suppressCharacterEmoji("我在呢😏", false), "我在呢");
assert.equal(suppressCharacterEmoji("[表情]|得意|https://example.com/a.png\n我在呢", false), "我在呢");
assert.equal(suppressCharacterEmoji("我在呢😂", true), "我在呢😂");

console.log("Character emoji policy: 6 acceptance checks passed");
