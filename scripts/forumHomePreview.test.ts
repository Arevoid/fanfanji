import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/features/forum/components/ForumThreadCard.tsx", "utf8");

assert.match(source, /<p className="mt-1\.5[\s\S]*?\{thread\.body\}/);
assert.doesNotMatch(source, /metrics\.lastReplyExcerpt\s*\|\|\s*thread\.body/);

console.log("PASS forum home preview renders thread body instead of latest reply excerpt");
