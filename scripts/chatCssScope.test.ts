import { strict as assert } from "node:assert";
import { normalizeChatCssSyntax, prioritizeUserChatCss, scopeUserChatCss } from "../src/features/chat/styles/chatCssScope";

const scope = '#conv-screen.user-custom-chat-css:not([data-chat-settings-open="true"]) #api-chat-screen > .chat-content-scope';
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

console.log("Chat CSS scope: 10 acceptance checks passed");
