import assert from "node:assert/strict";
import fs from "node:fs";

const chatSource = fs.readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const cssTemplateCopySource = fs.readFileSync(new URL("../src/features/chat/hooks/useChatCssTemplateCopy.ts", import.meta.url), "utf8");
const templateSource = fs.readFileSync(new URL("../src/features/chat/styles/chatThemeTemplate.ts", import.meta.url), "utf8");
const themeSource = `${chatSource}\n${templateSource}`;
const settingsSource = fs.readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
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
  assert.match(themeSource, new RegExp(selector), `${selector} must remain part of the stable chat theme interface`);
}

assert.match(redPacketSource, /chat-message--payment chat-message--red-packet special-payment-card redpacket-card cv-transfer/);
assert.match(transferSource, /chat-message--payment chat-message--transfer special-payment-card transfer-card cv-transfer/);
assert.match(forumShareSource, /chat-message--forum-share/);
const quoteReplyBodyIndex = chatSource.indexOf("message-quote__reply-body px-3");
const quoteBlockIndex = chatSource.indexOf("message-quote message-quote__header");
assert.ok(quoteReplyBodyIndex >= 0 && quoteBlockIndex > quoteReplyBodyIndex, "quote body must precede the combined quote block");
assert.match(chatSource, /message-quote message-quote__header[\s\S]*message-quote__prefix[\s\S]*message-quote__author[\s\S]*message-quote__separator[\s\S]*message-quote__content/);
assert.match(redPacketSource, /special-payment-card__note wechat-redpacket__title/);
assert.match(redPacketSource, /wechat-redpacket__footer[\s\S]*微信红包/);
assert.match(redPacketSource, /redpacket-card__legacy-title/);
for (const hook of [
  "message-quote__author",
  "message-quote__separator",
  "wechat-redpacket__main",
  "wechat-redpacket__icon",
  "wechat-redpacket__icon-symbol",
  "wechat-redpacket__content",
  "wechat-redpacket__title",
  "wechat-redpacket__status",
  "wechat-redpacket__money",
  "wechat-redpacket__footer",
  "wechat-transfer__main",
  "wechat-transfer__icon",
  "wechat-transfer__icon-symbol",
  "wechat-transfer__content",
  "wechat-transfer__amount",
  "wechat-transfer__status",
  "wechat-transfer__memo",
  "wechat-transfer__footer",
]) {
  assert.match(themeSource, new RegExp(hook), `${hook} must remain part of the semantic chat theme interface`);
}
for (const item of ["album", "text-image", "red-packet", "voice", "call", "location", "sticker"]) {
  assert.match(chatSource, new RegExp(`chat-attachment-item--${item}`), `${item} tool must expose a stable theme hook`);
}
assert.match(themeSource, /--chat-header-control-bg:/);
assert.match(themeSource, /--chat-attachment-panel-bg:/);
assert.doesNotMatch(themeSource, /received-transfer-card/);
assert.doesNotMatch(themeSource, /chat-bubble-(?:self|other)\s+\*/);
assert.doesNotMatch(settingsSource, /chat-bubble-(?:self|other)\s+\*/);
assert.doesNotMatch(themeSource, /#conv-screen \.transfer-card/);
assert.match(themeSource, /默认保持注释，避免在尚未配置图片 URL 时隐藏功能图标/);
assert.match(themeSource, /\/\*\s*\n\.cv-plus-icon svg,/);

// The visible placeholder and both clipboard paths must use the same current template.
assert.match(chatSource, /placeholder=\{COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE\}/);
assert.match(cssTemplateCopySource, /navigator\.clipboard\.writeText\(COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE\)/);
assert.match(cssTemplateCopySource, /textarea\.value = COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE/);

// Compatibility contract: append stable hooks without replacing legacy selectors.
assert.match(chatSource, /voice-message-bar/);
assert.match(chatSource, /chat-bubble-self/);
assert.match(chatSource, /chat-bubble-other/);
assert.match(redPacketSource, /special-payment-card redpacket-card cv-transfer/);
assert.match(transferSource, /special-payment-card transfer-card cv-transfer/);

console.log("chat theme interface regression tests passed");
