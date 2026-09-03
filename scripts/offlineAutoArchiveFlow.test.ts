import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const workspaceExit = readFileSync(new URL("../src/features/offline/hooks/useOfflineWorkspaceExitActions.ts", import.meta.url), "utf8");
const memorySync = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryMemorySyncActions.ts", import.meta.url), "utf8");
const finalization = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryExitFinalization.ts", import.meta.url), "utf8");
const lifecycleSource = `${source}\n${workspaceExit}\n${memorySync}\n${finalization}`;

assert.match(
  lifecycleSource,
  /const completedStory = await finalizeStoryBeforeLeaving\(latestStory\);/,
  "returning to online chat uses the same story-finalization path",
);
assert.match(
  lifecycleSource,
  /finalizeStoryBeforeLeaving[\s\S]*handleSyncMemoryToBrain\(story, \{ userConfirmed: true, syncIntent: "automatic_end" \}\)/,
  "ending or returning from a continuation confirms automatic memory sync",
);
assert.match(finalization, /if \(!completedStory\.archivedAt\)/, "leaving marks the current offline story as ended even without automatic sync");
assert.match(
  source,
  /handleSyncMemoryToBrain\(activeStory, \{ userConfirmed: true, syncIntent: "manual_settings" \}\)/,
  "settings sync carries an explicit manual intent for Director and IF",
);
assert.doesNotMatch(
  source,
  /showToast\("当前模式不会在结束时自动同步记忆；如需让线上角色记住，请在剧本设置中手动同步。"\)/,
  "opening a Director or IF story no longer shows the sync reminder toast",
);
assert.match(memorySync, /setMemorySyncingStoryId\(story\.id\)/, "sync starts a visible processing state");
assert.match(memorySync, /同步中，请稍候…/, "manual sync button reports progress");
assert.match(memorySync, /当前进展已经同步，无需重复处理/, "already-synced clicks receive explicit feedback");
assert.match(memorySync, /needsUninformativeSummaryRepair/, "legacy generic summaries remain eligible for a useful resync");
assert.match(memorySync, /提炼接口未返回可用摘要，已保存可核对的安全剧情摘要/, "safe fallback success is distinguished from an AI-generated summary");
assert.match(memorySync, /hasOfflineStorySummary\(story, mergedMemories\)/, "sync success verifies that the canonical story summary is present");
assert.match(source, /loading=\{memorySyncingStoryId === activeStory\.id\}/, "duplicate clicks are disabled while syncing");

console.log("PASS offline continuation auto archive and fictional-branch manual sync wiring");
