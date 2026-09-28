import assert from "node:assert/strict";
import { ensureExplicitStickerDelivery, extractStickerMarkupReferences, mayCharacterUseEmoji, suppressCharacterEmoji } from "../src/features/chat/services/characterEmojiPolicy";

assert.equal(mayCharacterUseEmoji({ latestUserMessage: "今天好累", recentCharacterMessages: [] }), false);
assert.equal(mayCharacterUseEmoji({ latestUserMessage: "哈哈😂", recentCharacterMessages: [] }), true);
assert.equal(mayCharacterUseEmoji({ latestUserMessage: "哈哈😂", recentCharacterMessages: ["我也😂"] }), false);
assert.equal(mayCharacterUseEmoji({ latestUserMessage: "等会你发这个表情包", recentCharacterMessages: ["我也发了一个[表情]|笑脸|sticker://old"] }), true);
assert.equal(mayCharacterUseEmoji({ latestUserMessage: "不要发表情包", recentCharacterMessages: [] }), false);
assert.equal(ensureExplicitStickerDelivery("好，我发过去了", "「引用 我：[表情]|兔兔|sticker://sticker-local-1|语义」\n等会你发这个表情"), "好，我发过去了\n\n[表情]|兔兔|sticker://sticker-local-1|语义");
assert.equal(ensureExplicitStickerDelivery("“好，我发过去了”", "「引用 我：[表情]|兔兔|sticker://sticker-local-1|语义」\n等会你发这个表情"), "“好，我发过去了”\n\n“[表情]|兔兔|sticker://sticker-local-1|语义”");
assert.equal(ensureExplicitStickerDelivery("我不发", "「引用 我：[表情]|兔兔|sticker://sticker-local-1|语义」\n等会你发这个表情"), "我不发");
assert.deepEqual(extractStickerMarkupReferences("好呀\n[表情]|兔兔|sticker://sticker-local-1|%E5%85%94%E5%AD%90"), [{
  raw: "[表情]|兔兔|sticker://sticker-local-1|%E5%85%94%E5%AD%90",
  name: "兔兔",
  stickerId: "sticker-local-1",
  semanticDescription: "兔子",
}]);
assert.equal(suppressCharacterEmoji("我在呢😏", false), "我在呢");
assert.equal(suppressCharacterEmoji("[表情]|得意|https://example.com/a.png\n我在呢", false), "我在呢");
assert.equal(suppressCharacterEmoji("我在呢😂", true), "我在呢😂");

console.log("Character emoji policy: 10 acceptance checks passed");
