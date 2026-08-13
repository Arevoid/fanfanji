import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/components/AppReading.tsx", import.meta.url), "utf8");
const reader = readFileSync(new URL("../src/components/reading/ReadingReader.tsx", import.meta.url), "utf8");
const wizard = readFileSync(new URL("../src/components/reading/ReadingWorldSetupWizard.tsx", import.meta.url), "utf8");

assert.match(app, /readingRoomReaderId/);
assert.match(app, /room=\{readerRoom\}/);
assert.match(app, /继续共读/);
assert.match(app, /穿书宇宙/);
assert.match(app, /自建世界/);
assert.match(app, /ReadingWorldSetupWizard/);

assert.match(reader, /createUserReadingComment/);
assert.match(reader, /startReadingDiscussion/);
assert.match(reader, /段评/);
assert.match(reader, /召唤/);
assert.match(reader, /scope: room/);

assert.match(wizard, /故事名称/);
assert.match(wizard, /故事题材/);
assert.match(wizard, /世界观/);
assert.match(wizard, /你的身份/);
assert.match(wizard, /friendIdentity/);
assert.match(wizard, /故事梗概/);
assert.match(wizard, /预期结局/);
assert.match(wizard, /篇幅长度/);

console.log("reading refactor rounds 5-6 UI checks passed");
