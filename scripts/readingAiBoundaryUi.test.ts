import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/features/reading/coReading/aiReadingBoundary.ts", import.meta.url), "utf8");
const appReading = readFileSync(new URL("../src/components/AppReading.tsx", import.meta.url), "utf8");

assert.match(service, /advanceAiReadingToParagraph/);
assert.match(service, /userRevealedSpoilers/);
assert.match(service, /blockedAnchorIds/);
assert.match(service, /aiKnownParagraphRange/);
assert.match(appReading, /让 TA 读到我的当前位置/);
assert.match(appReading, /已知章节/);
assert.match(appReading, /私人笔记或其他房间内容/);

console.log("AI reading boundary UI checks passed");
