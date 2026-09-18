import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/features/forum/components/ForumThreadCard.tsx", "utf8");

assert.match(source, /<h2 className="min-w-0 flex-1 line-clamp-2/);
assert.match(source, /<p className="mt-1 line-clamp-2[\s\S]*?\{thread\.body\}/);
assert.match(source, /#\{category\}/);
assert.match(source, /<Eye className="h-3 w-3"/);
assert.doesNotMatch(source, /<ForumAvatar/);
assert.doesNotMatch(source, /metrics\.lastReplyExcerpt\s*\|\|\s*thread\.body/);

console.log("PASS forum home preview renders compact title and metadata rows");
