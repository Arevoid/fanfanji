import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/components/AppReading.tsx", import.meta.url), "utf8");
const sheet = readFileSync(new URL("../src/components/reading/ReadingBookActionSheet.tsx", import.meta.url), "utf8");
const wizard = readFileSync(new URL("../src/components/reading/ReadingStorySetupWizard.tsx", import.meta.url), "utf8");
const coStory = readFileSync(new URL("../src/components/reading/ReadingCoStoryView.tsx", import.meta.url), "utf8");
const playShell = readFileSync(new URL("../src/components/reading/ReadingStoryPlayShell.tsx", import.meta.url), "utf8");

assert.match(app, /setTimeout[\s\S]*?520/);
assert.match(app, /onContextMenu/);
assert.match(app, /handleBookCardClick/);
assert.match(sheet, /编辑/);
assert.match(sheet, /书籍封面/);
assert.match(sheet, /共读/);
assert.match(sheet, /穿书/);
assert.match(wizard, /单人穿书/);
assert.match(wizard, /双人穿书/);
assert.match(wizard, /身穿/);
assert.match(wizard, /魂穿/);
assert.match(wizard, /故事长度/);
assert.match(playShell, /我选择…/);

console.log("reading refactor rounds 3-4 UI checks passed");
