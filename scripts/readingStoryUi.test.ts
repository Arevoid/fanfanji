import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const view = readFileSync(new URL("../src/components/reading/ReadingStoryView.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppReading.tsx", import.meta.url), "utf8");
const generation = readFileSync(new URL("../src/features/reading/story/readingStoryGeneration.ts", import.meta.url), "utf8");
assert.match(view, /故事正文/);
assert.match(view, /下一步选项/);
assert.match(view, /输入你的行动/);
assert.match(view, /档案/);
assert.match(view, /情报/);
assert.match(view, /读档/);
assert.match(app, /setReadingStoryBookId/);
assert.match(app, /穿书：进入这本小说的故事宇宙/);
assert.match(generation, /validateReadingStoryTurnResult/);
assert.match(generation, /commitReadingStoryTurn/);
console.log("reading story UI integration checks passed");
