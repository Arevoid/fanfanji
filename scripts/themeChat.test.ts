import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const innerVoice = readFileSync(new URL("../src/features/chat/components/InnerVoiceModal.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const conversations = readFileSync(new URL("../src/features/chat/components/ConversationList.tsx", import.meta.url), "utf8");
const contacts = readFileSync(new URL("../src/features/chat/components/ContactList.tsx", import.meta.url), "utf8");
assert.match(chat, /data-chat-shell/);
assert.match(innerVoice, /border-\[var\(--divider\)\]/);
assert.match(conversations, /onSelect\(id\)/);
assert.match(contacts, /onSelect\(id\)/);
assert.match(conversations, /var\(--text-primary\)/);
assert.match(contacts, /var\(--text-primary\)/);
assert.match(chat, /settings\.bubbleCss/);
assert.match(chat, /settings\.selfBubbleRadius/);
assert.match(chat, /settings\.otherBubbleRadius/);
console.log("PASS relation entry ids, inner voice surface tokens and chat custom CSS preservation");
