import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.match(
  source,
  /const completedStory = await finalizeStoryBeforeLeaving\(latestStory\);/,
  "returning to online chat uses the same story-finalization path",
);
assert.match(
  source,
  /finalizeStoryBeforeLeaving[\s\S]*handleSyncMemoryToBrain\(story, \{ userConfirmed: true, syncIntent: "automatic_end" \}\)/,
  "ending or returning from a continuation confirms automatic memory sync",
);
assert.match(source, /if \(!completedStory\.archivedAt\)/, "leaving marks the current offline story as ended even without automatic sync");
assert.match(
  source,
  /handleSyncMemoryToBrain\(activeStory, \{ userConfirmed: true, syncIntent: "manual_settings" \}\)/,
  "settings sync carries an explicit manual intent for Director and IF",
);
assert.match(
  source,
  /当前模式结束时不会自动总结或同步记忆。如需让线上角色记住本剧情，请进入“剧本设置”并手动同步。/,
  "Director and IF creation shows a persistent warning",
);
assert.match(
  source,
  /当前模式不会在结束时自动同步记忆；如需让线上角色记住，请在剧本设置中手动同步。/,
  "opening a Director or IF story shows a reminder",
);
assert.match(source, /setMemorySyncingStoryId\(story\.id\)/, "sync starts a visible processing state");
assert.match(source, /同步中，请稍候…/, "manual sync button reports progress");
assert.match(source, /当前进展已经同步，无需重复处理/, "already-synced clicks receive explicit feedback");
assert.match(source, /disabled=\{memorySyncingStoryId === activeStory\.id\}/, "duplicate clicks are disabled while syncing");

console.log("PASS offline continuation auto archive and fictional-branch manual sync wiring");
