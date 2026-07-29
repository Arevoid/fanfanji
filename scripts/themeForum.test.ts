import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const forum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/theme-b2.css", import.meta.url), "utf8");
assert.match(forum, /data-theme-page="forum"/);
assert.match(forum, /ForumDmList/);
assert.match(forum, /ForumDmConversation/);
assert.match(css, /\[data-theme-page="forum"\] \.forum-quote/);
console.log("PASS forum surface path preserves DM and quote components");
