import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appForum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const storyHook = readFileSync(new URL("../src/features/forumStory/hooks/useForumStoryScheduler.ts", import.meta.url), "utf8");
const activityHook = readFileSync(new URL("../src/features/forum/hooks/useForumActivityEngine.ts", import.meta.url), "utf8");

assert.match(appForum, /useForumStoryScheduler\(/);
assert.match(appForum, /useForumActivityEngine\(/);
assert.match(storyHook, /taskType: "forum-story-progression"/);
assert.match(storyHook, /runForumStorySchedulerTick/);
assert.match(activityHook, /taskType: "forum-activity"/);

console.log("PASS forum activity and forum-story progression are registered with the durable scheduler");
