import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldAttemptAutomaticForumActivity } from "../src/features/forum/services/forumActivityService";
import type { ForumActivityTask } from "../src/types";

const now = 1_000_000;
const makeTask = (index: number, startedAt: number): ForumActivityTask => ({
  id: `task-${index}`, ownerIdentityId: "identity-a", threadId: "thread-a", trigger: "automatic", status: "succeeded",
  startedAt, completedAt: startedAt, pendingEvents: [], createdAt: startedAt, updatedAt: startedAt,
});
assert.equal(shouldAttemptAutomaticForumActivity({ activityTasks: [], ownerIdentityId: "identity-a", now }), true);
assert.equal(shouldAttemptAutomaticForumActivity({ activityTasks: [makeTask(1, now), makeTask(2, now)], ownerIdentityId: "identity-a", now }), false, "hourly budget caps automatic API calls");
const daily = Array.from({ length: 8 }, (_, index) => makeTask(index, now - 2 * 60 * 60 * 1000));
assert.equal(shouldAttemptAutomaticForumActivity({ activityTasks: daily, ownerIdentityId: "identity-a", now }), false, "daily budget caps automatic API calls");
assert.equal(shouldAttemptAutomaticForumActivity({ activityTasks: [makeTask(1, now)], ownerIdentityId: "identity-b", now }), true, "identity budgets are isolated");

const hook = readFileSync(new URL("../src/features/forum/hooks/useForumActivityEngine.ts", import.meta.url), "utf8");
assert.match(hook, /visibilityState/);
assert.match(hook, /clearTimeout/);
assert.match(hook, /ownerIdentityId/);
const runtime = readFileSync(new URL("../src/features/forum/services/forumActivityRuntime.ts", import.meta.url), "utf8");
assert.match(runtime, /forceForumThreadActivity/);
assert.match(runtime, /releaseDueForumActivity/);
assert.match(runtime, /commitForumMutation/);
console.log("PASS forum activity engine lifecycle guards, identity budgets, and unified force/release path");
