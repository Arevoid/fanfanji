import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appReading = readFileSync(
  new URL("../src/components/AppReading.tsx", import.meta.url),
  "utf8",
);
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const service = readFileSync(
  new URL(
    "../src/features/reading/coReading/readingCoReading.ts",
    import.meta.url,
  ),
  "utf8",
);

assert.match(appReading, /rootTab.*co_reading/);
assert.match(appReading, /buildReadingActivityItems/);
assert.match(appReading, /邀请一位 AI 好友共读/);
assert.match(appReading, /独立房间/);
assert.match(appReading, /选择后立即建立共读房间/);
assert.match(
  appReading,
  /respondToReadingInvitation\(\{[\s\S]*?scope: room,[\s\S]*?decision: "accept"/,
);
assert.match(appReading, /共读评价/);
assert.match(appReading, /召唤 TA/);
assert.match(appReading, /仅当前房间可见/);
assert.match(
  app,
  /<AppReading[\s\S]*?characters=\{characters\}[\s\S]*?relationships=\{relationships\}/,
);
assert.match(service, /createReadingRoom/);
assert.match(service, /decision === "accept"/);
assert.match(service, /decision === "decline"/);

console.log("reading co-reading UI integration checks passed");
