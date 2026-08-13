import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appReading = readFileSync(
  new URL("../src/components/AppReading.tsx", import.meta.url),
  "utf8",
);
const reader = readFileSync(
  new URL("../src/components/reading/ReadingReader.tsx", import.meta.url),
  "utf8",
);

assert.match(
  appReading,
  /<ReadingReader[\s\S]*?userIdentityId=\{userIdentityId\}[\s\S]*?bookId=\{readingBookId\}/,
);
assert.match(
  appReading,
  /继续阅读 · \$\{selectedProgress\.percent\.toFixed\(1\)\}%/,
);
assert.match(reader, /aria-label="小说正文"[\s\S]*overflow-y-auto/);
assert.match(reader, /data-anchor-id=\{paragraph\.anchor\.id\}/);
assert.match(reader, /characterOffset: Math\.round/);
assert.match(
  reader,
  /scrollToAnchor\(target, "auto", progress\?\.characterOffset \|\| 0\)/,
);
assert.match(reader, /aria-label="打开目录"/);
assert.match(reader, /上一章[\s\S]*下一章/);
assert.doesNotMatch(
  reader,
  /overflow-x-auto|左右翻页|translateX/,
  "Round 5 remains a vertical continuous reader",
);

console.log("reading vertical reader interface tests passed");
