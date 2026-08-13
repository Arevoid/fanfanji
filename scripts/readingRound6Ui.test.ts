import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reader = readFileSync(
  new URL("../src/components/reading/ReadingReader.tsx", import.meta.url),
  "utf8",
);
const library = readFileSync(
  new URL("../src/components/AppReading.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../src/components/AppSettings.tsx", import.meta.url),
  "utf8",
);

assert.match(reader, /aria-label="搜索正文"/);
assert.match(reader, /searchReadingContent\(content, searchQuery\)/);
assert.match(reader, /onMouseUp=\{\(event\) => selectParagraphRange/);
assert.match(reader, /navigator\.clipboard\.writeText/);
assert.match(
  reader,
  /createReadingAnnotation[\s\S]*kind: "highlight"[\s\S]*start: activeParagraph\.start/,
);
assert.match(reader, /kind: "note"[\s\S]*note, start: activeParagraph\.start/);
assert.match(reader, /toggleReadingBookmark/);
assert.match(reader, /fontAssetDb\.getFont\(preferences\.fontAssetId\)/);
assert.match(
  reader,
  /fontAssetId: event\.target\.checked \? GLOBAL_FONT_ASSET_ID : undefined/,
);
assert.match(reader, /aria-label="阅读排版设置"/);
assert.match(library, /buildReadingArchive\(userIdentityId\)/);
assert.match(
  library,
  /restoreReadingArchive\([\s\S]*?JSON\.parse\(await file\.text\(\)\)[\s\S]*?userIdentityId[\s\S]*?\)/,
);
assert.match(
  library,
  /已恢复 \$\{restored\.restoredBooks\} 本书，正文、进度和标注均已写回本地/,
);
assert.match(settings, /阅读小说请在“阅读”应用导出含正文的阅读归档/);
assert.doesNotMatch(settings, /本机内的所有数据完整导出/);

console.log("reading round 6 tools and archive interface tests passed");
