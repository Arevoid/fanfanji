import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const forum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const archives = readFileSync(new URL("../src/components/AppArchives.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/theme-b2.css", import.meta.url), "utf8");
assert.match(forum, /data-theme-page="forum"/);
assert.doesNotMatch(forum, /ForumDmList|ForumDmConversation/);
assert.match(css, /\[data-theme-page="forum"\] \.forum-quote/);
assert.match(forum, /bg-\[var\(--button-primary-bg\)\].*text-\[var\(--button-primary-text\)\]/);
assert.match(archives, /initialChatMode === "greeting" \? "bg-\[var\(--button-primary-bg\)\]/);
assert.match(archives, /initialChatMode === "context" \? "bg-\[var\(--button-primary-bg\)\]/);
console.log("PASS forum surface path excludes removed DM and preserves quote components");
