import assert from "node:assert/strict";
import fs from "node:fs";

const chatSource = fs.readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const redPacketSource = fs.readFileSync(new URL("../src/features/chat/components/SpecialMessage/RedPacketCard.tsx", import.meta.url), "utf8");
const transferSource = fs.readFileSync(new URL("../src/features/chat/components/SpecialMessage/TransferCard.tsx", import.meta.url), "utf8");
const forumShareSource = fs.readFileSync(new URL("../src/features/forum/components/ForumShareCard.tsx", import.meta.url), "utf8");

for (const selector of [
  "chat-message--text",
  "chat-message--voice",
  "chat-message--voice-wave",
  "chat-message--voice-duration",
  "chat-message--call",
  "chat-message--call-icon",
  "chat-message--call-duration",
  "chat-message--image",
  "chat-message--text-image",
  "chat-message--sticker",
  "chat-message--diary-share",
  "chat-header__back-button",
  "chat-header__more-button",
  "chat-attachment-item",
  "chat-attachment-icon",
  "chat-attachment-label",
]) {
  assert.match(chatSource, new RegExp(selector), `${selector} must remain part of the stable chat theme interface`);
}

assert.match(redPacketSource, /chat-message--payment chat-message--red-packet special-payment-card redpacket-card cv-transfer/);
assert.match(transferSource, /chat-message--payment chat-message--transfer special-payment-card transfer-card cv-transfer/);
assert.match(forumShareSource, /chat-message--forum-share/);
for (const item of ["album", "text-image", "red-packet", "voice", "call", "location", "sticker"]) {
  assert.match(chatSource, new RegExp(`chat-attachment-item--${item}`), `${item} tool must expose a stable theme hook`);
}
assert.match(chatSource, /--chat-header-control-bg:/);
assert.match(chatSource, /--chat-attachment-panel-bg:/);

// The visible placeholder and both clipboard paths must use the same current template.
assert.match(chatSource, /placeholder=\{COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE\}/);
assert.match(chatSource, /navigator\.clipboard\.writeText\(COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE\)/);
assert.match(chatSource, /textarea\.value = COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE/);

// Compatibility contract: append stable hooks without replacing legacy selectors.
assert.match(chatSource, /voice-message-bar/);
assert.match(chatSource, /chat-bubble-self/);
assert.match(chatSource, /chat-bubble-other/);
assert.match(redPacketSource, /special-payment-card redpacket-card cv-transfer/);
assert.match(transferSource, /special-payment-card transfer-card cv-transfer/);

console.log("chat theme interface regression tests passed");
