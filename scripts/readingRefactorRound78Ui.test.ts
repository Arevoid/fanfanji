import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync(
  new URL(
    "../src/components/reading/ReadingStoryPlayShell.tsx",
    import.meta.url,
  ),
  "utf8",
);
const solo = readFileSync(
  new URL("../src/components/reading/ReadingStoryView.tsx", import.meta.url),
  "utf8",
);
const shared = readFileSync(
  new URL("../src/components/reading/ReadingCoStoryView.tsx", import.meta.url),
  "utf8",
);

assert.match(shell, /data-theme-page="reading-story-play"/);
assert.match(shell, /下一步怎么走/);
assert.match(shell, /故事行动区/);
assert.match(shell, /故事快捷面板/);
assert.match(shell, /choicesExpanded/);
assert.match(shell, /activePanelId/);
assert.match(shell, /safe-area-inset-bottom/);

assert.match(solo, /ReadingStoryPlayShell/);
assert.match(solo, /状态/);
assert.match(solo, /角色/);
assert.doesNotMatch(solo, /label: "情报"/);
assert.match(solo, /存档/);

assert.match(shared, /ReadingStoryPlayShell/);
assert.match(shared, /createReadingCoStorySave/);
assert.match(shared, /loadReadingCoStorySave/);
assert.match(shared, /双方身份与知识状态已恢复/);
assert.doesNotMatch(shared, /让 .* 回应/);
assert.match(shared, /会自主参与/);
assert.match(shared, /AI 好友不会替你选择/);

console.log("reading refactor rounds 7-8 unified story UI checks passed");
