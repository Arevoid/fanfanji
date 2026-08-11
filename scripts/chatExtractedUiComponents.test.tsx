import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatAvatar } from "../src/features/chat/components/ChatAvatar";
import { ChatSettingsSwitch } from "../src/features/chat/components/ChatSettingsSwitch";
import { StoredChatImage } from "../src/features/chat/components/StoredChatImage";
import { COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE } from "../src/features/chat/styles/chatThemeTemplate";

const avatar = renderToStaticMarkup(<ChatAvatar src="🌸" alt="小樱" name="小樱" className="avatar" />);
assert.match(avatar, /🌸/);
assert.match(avatar, /avatar/);

const toggle = renderToStaticMarkup(<ChatSettingsSwitch checked onChange={() => undefined} label="自动翻译" />);
assert.match(toggle, /role="switch"/);
assert.match(toggle, /aria-checked="true"/);
assert.match(toggle, /aria-label="自动翻译"/);

const storedImage = renderToStaticMarkup(<StoredChatImage assetId="missing" alt="generated chat image" />);
assert.match(storedImage, /chat-message--image-placeholder/);
assert.match(COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE, /\.voice-message-bar/);
assert.match(COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE, /\.chat-message--payment/);
assert.match(COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE, /\.chat-composer__attachment-panel/);

const appChatSource = readFileSync("src/components/AppChat.tsx", "utf8");
assert.match(appChatSource, /from "\.\.\/features\/chat\/components\/ChatAvatar"/);
assert.match(appChatSource, /from "\.\.\/features\/chat\/components\/StoredChatImage"/);
assert.match(appChatSource, /from "\.\.\/features\/chat\/components\/ChatSettingsSwitch"/);
assert.match(appChatSource, /from "\.\.\/features\/chat\/styles\/chatThemeTemplate"/);
assert.doesNotMatch(appChatSource, /const RenderAvatar\s*=/);
assert.doesNotMatch(appChatSource, /const StoredChatImage\s*=/);
assert.doesNotMatch(appChatSource, /const COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE\s*=/);

console.log("PASS extracted chat avatar, image, settings switch, and theme template boundaries");
