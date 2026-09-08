import assert from "node:assert/strict";
import { compactForumState, estimateForumStorageUsage, FORUM_HISTORY_LIMIT } from "../src/domain/forum/forumCapacity";

const state = { visitHistory: Array.from({ length: FORUM_HISTORY_LIMIT + 5 }, (_, index) => ({ id: `visit-${index}`, ownerIdentityId: "a", lastVisitedAt: index })), likeHistory: [], notifications: [], generationTasks: [], activityTasks: [] } as any;
const compacted = compactForumState(state,);
assert.equal(compacted.visitHistory.length, FORUM_HISTORY_LIMIT);
assert.ok(estimateForumStorageUsage(compacted).bytes > 0);
console.log("forum capacity tests passed");
