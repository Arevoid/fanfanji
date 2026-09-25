import { strict as assert } from "node:assert";
import { hasExplicitRedPacketChatCss, normalizeChatCssSyntax, prioritizeUserChatCss, scopeUserChatCss } from "../src/features/chat/styles/chatCssScope";

const scope = '#conv-screen.user-custom-chat-css #api-chat-screen > .chat-content-scope';
assert.doesNotMatch(scopeUserChatCss(".chat-bubble-self { color: red; }"), /data-chat-settings-open/);
assert.equal(normalizeChatCssSyntax("font‐size: 12px"), "font-size: 12px");
const scoped = scopeUserChatCss(".chat-bubble-self, body.dark { color: red; }");
assert.equal(scoped.includes(`${scope} .chat-bubble-self`), true);
assert.equal(scoped.includes(`${scope}.dark`), true);
const nested = scopeUserChatCss("@media (max-width: 500px) { .message { color: red; } }");
assert.equal(nested.includes(`${scope} .message`), true);
const keyframes = scopeUserChatCss("@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }");
assert.equal(keyframes.includes(`${scope} from`), false);
assert.equal(keyframes.includes("from { opacity: 0; }"), true);
const prioritized = prioritizeUserChatCss('.message { color: red; background: url("x;y"); border: 0 !important; }');
assert.equal(prioritized.includes("color: red !important;"), true);
assert.equal(prioritized.includes('background: url("x;y") !important;'), true);
assert.equal(prioritized.includes("border: 0 !important;"), true);
const keyframePriority = prioritizeUserChatCss("@keyframes pulse { from { opacity: 0; } }");
assert.equal(keyframePriority.includes("opacity: 0 !important"), false);
assert.equal(hasExplicitRedPacketChatCss(".chat-bubble-self { color: red; }"), false);
assert.equal(hasExplicitRedPacketChatCss(".redpacket-card { background: pink; }"), true);
assert.equal(hasExplicitRedPacketChatCss(".redpacket-card__brand { opacity: 1; }"), true);
assert.equal(hasExplicitRedPacketChatCss(".wechat-redpacket__title { color: pink; }"), true);
assert.equal(hasExplicitRedPacketChatCss("/* .redpacket-card { background: pink; } */ .chat-bubble-self { color: red; }"), false);
assert.equal(hasExplicitRedPacketChatCss(":root { --redpacket-bg: pink; }"), true);

console.log("Chat CSS scope: 16 acceptance checks passed");
