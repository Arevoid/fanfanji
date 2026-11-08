import assert from "node:assert/strict";
import fs from "node:fs";
import { CSS_API_V2_SCOPE_SELECTOR, scopeUserChatCssV2 } from "../src/features/chat/styles/chatCssScope";
import { buildChatThemePackage, parseChatThemePackage } from "../src/features/chat/styles/chatThemePackage";

const scoped = scopeUserChatCssV2(":root { --x: 1; } .chat-header, body.dark .chat-composer { color: red; }");
assert.match(scoped, new RegExp(CSS_API_V2_SCOPE_SELECTOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(scoped, /data-chat-css-api="2".*\.chat-header/);
assert.doesNotMatch(scoped, /#api-chat-screen > \.chat-content-scope/);

const exported = buildChatThemePackage({
  cssApiVersion: 2,
  css: ".chat-header { color: red; }",
  icons: { more: "https://example.test/more.svg", video: "  " },
  exportedAt: "2026-01-01T00:00:00.000Z",
});
assert.equal(exported.schemaVersion, 2);
assert.equal(exported.cssApiVersion, 2);
assert.equal(exported.assets.icons.more, "https://example.test/more.svg");
assert.equal(exported.assets.icons.video, undefined);
assert.deepEqual(parseChatThemePackage(exported), {
  cssApiVersion: 2,
  name: "饭饭机聊天主题",
  css: ".chat-header { color: red; }",
  icons: { more: "https://example.test/more.svg" },
});
assert.deepEqual(parseChatThemePackage({ version: 1, chatGlobalCSS: ".legacy{}", chatIcons: { plus: "x" } }), {
  cssApiVersion: 1,
  css: ".legacy{}",
  icons: { plus: "x" },
});
assert.throws(() => parseChatThemePackage({ format: "fanfanji-chat-theme", schemaVersion: 99 }));

const chat = fs.readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const composer = fs.readFileSync(new URL("../src/features/chat/components/ChatComposer.tsx", import.meta.url), "utf8");
const attachmentMenu = fs.readFileSync(new URL("../src/features/chat/components/AttachmentMenu.tsx", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../src/features/chat/styles/chatCssApiV2Template.ts", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

for (const hook of [
  "chat-header__identity", "chat-header__avatar", "chat-header__title", "chat-messages",
  "chat-message-row", "chat-composer__input-shell", "chat-tools", "chat-tool__icon", "chat-tool__label",
]) assert.match(`${chat}\n${composer}\n${attachmentMenu}`, new RegExp(hook), `${hook} must be exposed by CSS API v2`);

for (const state of ["data-chat-css-api", "data-message-side", "data-message-kind", "data-message-state", "data-has-translation", "data-selected", "data-has-text", "data-tools-open", "data-tools-expanded", "data-tool-key", "data-tool-tier"]) {
  assert.match(`${chat}\n${composer}`, new RegExp(state), `${state} must remain a stable CSS state`);
}
for (const token of ["--chat-header-identity-gap", "--chat-header-status-gap", "--chat-tools-columns", "--chat-tools-display", "--chat-safe-bottom", "--chat-transfer-bg", "--chat-redpacket-bg", "--chat-focus-ring"]) {
  assert.match(template, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${token} must be in the v2 starter template`);
}
assert.doesNotMatch(chat, /\{showAttachPanel\s*&&\s*\(\s*<AttachmentMenu/, "tool nodes must remain mounted for CSS-only layouts");
assert.match(css, /\.chat-composer__input-shell\s*\{\s*display:\s*contents/);
assert.match(css, /\.chat-tools\[data-tools-open="false"\]\s*\{\s*display:\s*none/);
assert.match(css, /\.chat-tool--more\s*\{\s*display:\s*none/);
assert.match(css, /\.chat-tools\[data-tools-open="true"\]\s+\.chat-tool--more\s*\{\s*display:\s*flex/);
assert.match(css, /data-tools-expanded="false"\]\s+\.chat-tool\[data-tool-tier="secondary"\]\s*\{\s*display:\s*none/);
assert.match(css, /data-tools-expanded="true"\]\s+\.chat-tool\[data-tool-tier="secondary"\]\s*\{\s*display:\s*flex/);

assert.match(chat, /chat-composer__attachment-panel\[data-tools-open="true"\]/);
assert.match(chat, /chat-composer__attachment-panel\[data-tools-open="false"\][\s\S]*display: none !important/);
assert.match(chat, /chat-composer__attachment-panel\[data-tools-open="true"\]\s+\.chat-tool--more[\s\S]*display: flex !important/);

console.log("Chat CSS API v2: scope, package migration, semantic hooks and default compatibility passed");
