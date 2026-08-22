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
assert.doesNotMatch(reader, /contentVisibility:\s*["']auto["']/);
assert.doesNotMatch(reader, /containIntrinsicSize:/);
assert.match(reader, /data-anchor-id=\{paragraph\.anchor\.id\}/);
assert.match(reader, /characterOffset: Math\.round/);
assert.match(
  reader,
  /initialAnchorId \|\| progress\?\.paragraphAnchorId/,
);
assert.match(reader, /modeSwitchPositionRef\.current = captureVisiblePosition\(\) \|\| currentPositionRef\.current/);
assert.match(reader, /scrollToAnchor\(position\.paragraph\.anchor\.id, "auto", position\.characterOffset\)/);
assert.match(reader, /aria-label="打开目录"/);
assert.match(reader, /上一章[\s\S]*下一章/);
assert.match(reader, /pageMode === "horizontal"/);
assert.match(reader, /overflow-x-auto overflow-y-hidden/);
assert.match(reader, /左右翻页/);
assert.match(reader, /复制[\s\S]*高亮[\s\S]*段评[\s\S]*书签[\s\S]*编辑/);
assert.doesNotMatch(reader, />分享<|navigator\.share/);
assert.match(reader, /handleReaderEdgeClick/);
assert.match(reader, /setIsImmersiveMode\(\(value\) => !value\)/);
assert.match(reader, /useState\(true\)/);
assert.match(reader, /absolute inset-x-0 top-0 z-20 flex h-14/);
assert.doesNotMatch(reader, /overflow-y-auto pb-28 pt-8/);
assert.match(reader, /aria-label=\{`召唤 \$\{room\.characterSnapshot\.name\} 讨论当前内容`\}/);
assert.match(reader, /handleDiscussionBallPointerMove/);
assert.match(reader, /!isImmersiveMode && !isLoading && !error/);
assert.match(reader, /和 \$\{room\.characterSnapshot\.name\} 讨论当前内容/);

assert.match(reader, /filter\(\(item\) => item\.targetParagraphAnchorId === context\.paragraph\.anchor\.id\)[\s\S]*sort\(byLatestUpdate\)\[0\]/);
assert.doesNotMatch(reader, /\|\| \[\.\.\.openDiscussions\]\.sort\(byLatestUpdate\)\[0\]/);
assert.match(reader, /ref=\{discussionScrollRef\}/);
assert.match(reader, /container\.scrollTop = container\.scrollHeight/);
assert.match(reader, /placeholder="讨论当前内容…" rows=\{1\}/);
assert.match(reader, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/);
assert.match(reader, /event\.key === "Enter" && !event\.shiftKey/);
assert.match(reader, /setDiscussionMessages\(listDiscussionMessages\(room, activeDiscussionId\)\)/);
assert.match(reader, /discussionThreads\.map\(\(\{ discussion, messages \}\)/);
assert.match(reader, /getDiscussionChapterTitle\(discussion\.targetChapterId\)/);
assert.match(appReading, /getReadingRoomProgress\(room\)\?\.percent/);
assert.match(appReading, /setReadingInitialAnchorId\(targetAnchorId\)/);
assert.match(appReading, /openCommentAtSource/);

console.log("reading reader modes and selection toolbar tests passed");
