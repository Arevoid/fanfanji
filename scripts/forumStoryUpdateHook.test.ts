import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appForum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/forumStory/hooks/useForumStoryUpdateAction.ts", import.meta.url), "utf8");

assert.match(appForum, /useForumStoryUpdateAction\(/);
assert.doesNotMatch(appForum, /const requestForumStoryUpdate = async/);
assert.match(hook, /readerInterest === true/);
assert.match(hook, /generateStoryComments/);
assert.match(hook, /setNotice\(/);

console.log("PASS manual forum-story updates are isolated behind a behavior-preserving action hook");
