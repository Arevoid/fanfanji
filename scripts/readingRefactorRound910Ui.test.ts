import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const solo = readFileSync(new URL("../src/components/reading/ReadingStoryView.tsx", import.meta.url), "utf8");
const shared = readFileSync(new URL("../src/components/reading/ReadingCoStoryView.tsx", import.meta.url), "utf8");
const generation = readFileSync(new URL("../src/features/reading/story/readingCoStoryGeneration.ts", import.meta.url), "utf8");

assert.match(shared, /generateReadingCoStoryTurn/);
assert.match(shared, /共同故事新回合已生成并自动保存/);
assert.match(generation, /validateReadingCoStoryTurnResult/);
assert.match(generation, /requestId/);
assert.match(generation, /expectedStoryUpdatedAt/);

for (const source of [solo, shared]) {
  assert.match(source, /修改故事名称/);
  assert.match(source, /暂停故事/);
  assert.match(source, /继续故事/);
  assert.match(source, /删除故事/);
}
assert.match(shared, /其他好友的故事/);

console.log("reading refactor rounds 9-10 continuous play and management UI checks passed");
