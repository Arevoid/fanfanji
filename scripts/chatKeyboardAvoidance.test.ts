import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("../src/features/chat/components/ChatComposer.tsx", import.meta.url), "utf8");

assert.match(chat, /VISUAL_VIEWPORT_CHANGE_EVENT/);
assert.match(chat, /nearBottomThreshold = 250 \+ Math\.max\(0, metrics\?\.keyboardInset \?\? 0\)/);
assert.match(chat, /scrollContainerToBottom\(container\)/);
assert.doesNotMatch(chat, /chatEndRef\.current\?*\.scrollIntoView/);
assert.match(chat, /min-h-0 flex-1 overflow-y-auto overflow-x-visible p-4 space-y-0 cv-messages-list chat-message-list/);
assert.doesNotMatch(chat, /window\.visualViewport\.addEventListener\("resize", handleViewportResize\)/);
assert.match(chat, /#conv-screen \.chat-composer__input \{[\s\S]*?box-sizing: border-box !important;[\s\S]*?padding: 10px 16px !important;[\s\S]*?line-height: 20px !important;/);
assert.match(composer, /return <div className=\{className\}>/);
assert.match(composer, /rows=\{1\}[\s\S]*className="[^\"]*h-10[^\"]*min-h-10[^\"]*max-h-24/);

console.log("PASS chat scrolls only its message container and preserves readers positioned in older history");
