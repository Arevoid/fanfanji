import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appReading = readFileSync(new URL("../src/components/AppReading.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src/core/storage/repositories/readingAnalysisRepository.ts", import.meta.url), "utf8");
assert.match(appReading, /aria-label="novel-analysis"/);
assert.match(appReading, /开始小说分析/);
assert.match(appReading, /从检查点重试/);
assert.match(appReading, /Book Bible/);
assert.match(appReading, /保存 Book Bible/);
assert.match(appReading, /仅当前身份可见/);
assert.match(repository, /readingAnalysisStore/);
assert.match(repository, /sameScope/);
console.log("reading analysis UI integration checks passed");
