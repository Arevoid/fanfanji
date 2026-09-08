import assert from "node:assert/strict";
import { getInterveningOfflineHandoff, getOfflineTimelineStoriesBetween } from "../src/features/chat/services/offlineHandoffPromptContext";

assert.equal(getInterveningOfflineHandoff({
  currentOnlineAt: undefined,
  relationId: "relation-1",
  currentChatMessages: [],
  offlineStories: [],
  memories: [],
}), undefined);
assert.deepEqual(getOfflineTimelineStoriesBetween({
  previousAt: undefined,
  currentAt: 100,
  relationId: "relation-1",
  isGroup: false,
  offlineStories: [],
  memories: [],
}), []);
assert.deepEqual(getOfflineTimelineStoriesBetween({
  previousAt: 1,
  currentAt: 100,
  relationId: "relation-1",
  isGroup: true,
  offlineStories: [],
  memories: [],
}), []);
console.log("Offline handoff prompt context: guard boundaries passed");
