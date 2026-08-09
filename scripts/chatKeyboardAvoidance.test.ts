import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("../src/features/chat/components/ChatComposer.tsx", import.meta.url), "utf8");

assert.match(chat, /VISUAL_VIEWPORT_CHANGE_EVENT/);
assert.match(chat, /scrollHeight - container\.scrollTop - container\.clientHeight > 250/);
assert.match(chat, /min-h-0 flex-1 overflow-y-auto overflow-x-visible p-4 space-y-4 cv-messages-list chat-message-list/);
assert.doesNotMatch(chat, /window\.visualViewport\.addEventListener\("resize", handleViewportResize\)/);
assert.match(composer, /return <div className=\{className\}>/);

console.log("PASS chat composer remains in flex flow and only follows keyboard viewport changes near the latest message");
