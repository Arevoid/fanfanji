import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const card = readFileSync(new URL("../src/features/forum/components/ForumThreadCard.tsx", import.meta.url), "utf8");
const forum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const dms = readFileSync(new URL("../src/features/forum/components/ForumDmList.tsx", import.meta.url), "utf8");
assert.match(card, /border-b border-\[var\(--divider\)\]/);
assert.match(forum, /border-b border-slate-100/);
assert.match(dms, /border-b border-slate-100/);
console.log("PASS forum thread cards have explicit semantic list dividers while reply and DM lists retain one divider per row");
