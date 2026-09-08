import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const view = readFileSync(
  new URL("../src/components/reading/ReadingStoryView.tsx", import.meta.url),
  "utf8",
);
const playShell = readFileSync(
  new URL(
    "../src/components/reading/ReadingStoryPlayShell.tsx",
    import.meta.url,
  ),
  "utf8",
);
const app = readFileSync(
  new URL("../src/components/AppReading.tsx", import.meta.url),
  "utf8",
);
const generation = readFileSync(
  new URL(
    "../src/features/reading/story/readingStoryGeneration.ts",
    import.meta.url,
  ),
  "utf8",
);
const coStoryView = readFileSync(
  new URL("../src/components/reading/ReadingCoStoryView.tsx", import.meta.url),
  "utf8",
);
const coStoryGeneration = readFileSync(
  new URL(
    "../src/features/reading/story/readingCoStoryGeneration.ts",
    import.meta.url,
  ),
  "utf8",
);
assert.match(view, /故事正文/);
assert.match(playShell, /我选择…/);
assert.match(playShell, /\["一", "二", "三", "四", "五", "六", "七", "八"\]/);
assert.match(playShell, /setChoicesExpanded\(true\)/);
assert.match(playShell, /relative z-30 shrink-0 border-t/);
assert.match(view, /输入你的行动/);
assert.match(view, /角色/);
assert.doesNotMatch(view, /label: "情报"/);
assert.match(view, /读档/);
assert.match(app, /setReadingStoryBookId/);
assert.match(app, /穿书：进入这本小说的故事宇宙/);
assert.match(generation, /validateReadingStoryTurnResult/);
assert.match(generation, /commitReadingStoryTurn/);
assert.match(generation, /requestId/);
assert.match(generation, /expectedStoryUpdatedAt/);
assert.doesNotMatch(coStoryView, /让 TA 提建议/);
assert.doesNotMatch(coStoryView, /询问 TA 的意见/);
assert.match(coStoryView, /会依据自己的人设、世界规则与当前所知自主行动/);
assert.match(coStoryView, /接受/);
assert.match(coStoryView, /拒绝/);
assert.match(coStoryView, /提交我的行动/);
assert.match(coStoryView, /你的视角/);
assert.match(coStoryGeneration, /generateReadingCoStoryAiAction/);
assert.match(coStoryView, /turn\.dialogue\.map/);
console.log("reading story UI integration checks passed");
