import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reachablePages = ["archives", "worldbook", "memory", "offline", "moments", "forum", "music", "store", "notes", "schedule", "stickers"];
const sources = ["AppArchives.tsx", "AppWorldBook.tsx", "AppMemory.tsx", "AppOffline.tsx", "../features/moments/MomentsApp.tsx", "AppForum.tsx", "AppMusic.tsx", "AppStore.tsx", "AppNotes.tsx", "AppSchedule.tsx", "StickerSettings.tsx"];
for (let index = 0; index < reachablePages.length; index += 1) {
  const file = sources[index].startsWith("../") ? `../src/components/${sources[index]}` : `../src/components/${sources[index]}`;
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.match(source, new RegExp(`data-theme-page=\\"${reachablePages[index]}\\"`));
}
const b1 = readFileSync(new URL("../src/styles/theme-b1.css", import.meta.url), "utf8");
const b2 = readFileSync(new URL("../src/styles/theme-b2.css", import.meta.url), "utf8");
assert.doesNotMatch(b1, /\[class\*=/);
assert.doesNotMatch(b2, /\[class\*=/);
assert.match(b2, /\[data-theme-page\]/);
console.log("PASS all reachable business pages expose a bounded dark-theme path");
