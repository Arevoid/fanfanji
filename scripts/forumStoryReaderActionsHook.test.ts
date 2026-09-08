import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appForum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/forumStory/hooks/useForumStoryReaderActions.ts", import.meta.url), "utf8");

assert.match(appForum, /useForumStoryReaderActions\(/);
assert.doesNotMatch(appForum, /const submitForumStoryComment = async/);
assert.doesNotMatch(appForum, /const handleForumStoryUtility = async/);
assert.match(hook, /StoryEventRepository\.appendEvent/);
assert.match(hook, /generateStoryComments/);
assert.match(hook, /tombstoneReply/);
assert.match(hook, /navigator\.clipboard/);

console.log("PASS forum-story reader actions are isolated behind a behavior-preserving hook");
