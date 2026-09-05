import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const forum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/theme-b2.css", import.meta.url), "utf8");
assert.match(forum, /data-theme-page="forum"/);
assert.doesNotMatch(forum, /ForumDmList|ForumDmConversation/);
assert.match(css, /\[data-theme-page="forum"\] \.forum-quote/);
console.log("PASS forum surface path excludes removed DM and preserves quote components");
