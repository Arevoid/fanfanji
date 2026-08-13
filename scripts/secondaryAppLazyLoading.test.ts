import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

for (const component of [
  "AppChat",
  "AppArchives",
  "AppWorldBook",
  "AppMusic",
  "AppForum",
  "AppNotes",
  "AppDiary",
  "AppStore",
  "AppSettings",
  "AppMemory",
  "AppOffline",
  "AppSchedule",
  "AppReading",
]) {
  assert.match(appSource, new RegExp(`const ${component} = React\\.lazy\\(load${component}\\)`));
  assert.doesNotMatch(appSource, new RegExp(`import ${component} from`));
}
assert.match(appSource, /function LazyAppBoundary/);
assert.match(appSource, /<React\.Suspense/);
assert.match(appSource, /requestIdleCallback\(preloadIdleApps, \{ timeout: 1500 \}\)/);
assert.match(appSource, /preloadApp\(item\.id\)/);
assert.match(appSource, /const IDLE_PRELOAD_APP_IDS = \[[^\]]+\]/);
assert.doesNotMatch(appSource, /IDLE_PRELOAD_APP_IDS = \[[^\]]*"chat"/);
assert.match(appSource, /activeApp === "chat" \|\| chatModuleActivated/);
assert.match(appSource, /if \(activeApp === "chat"\) setChatModuleActivated\(true\)/);
assert.match(appSource, /else if \(activeApp === null\) setChatModuleActivated\(false\)/);
assert.doesNotMatch(appSource, /正在打开/);
assert.doesNotMatch(appSource, /import AppChat(?:,\s*\{[^}]+\})? from "\.\/components\/AppChat"/);
assert.match(appSource, /import \{ resolveActiveChatStylePreset \} from "\.\/features\/chat\/styles\/chatStylePreset"/);

console.log("all application lazy-loading and chat mount-retention tests passed");
