import assert from "node:assert/strict";
import {
  MAX_FRIEND_REQUEST_ATTEMPTS,
  buildBlockedDeliverySummary,
  canCreateFriendRequest,
  createBlockedDeliveryRecord,
  createFriendRequestRecord,
  isBlockedDeliveryDirection,
  updateFriendRequestStatus,
} from "../src/domain/relationship/relationshipBlock";

const relation = { id: "relation-1", characterId: "char-1", userIdentityId: "identity-1" };

assert.equal(MAX_FRIEND_REQUEST_ATTEMPTS, 5);
assert.equal(canCreateFriendRequest(4), true);
assert.equal(canCreateFriendRequest(5), false);
assert.equal(buildBlockedDeliverySummary("hello", "message"), "消息未送达：hello");
assert.equal(buildBlockedDeliverySummary("", "video_call"), "视频通话请求未送达");
assert.equal(isBlockedDeliveryDirection({ communicationStatus: "blocked", blockedBy: "user" }, "character_to_user"), true);
assert.equal(isBlockedDeliveryDirection({ communicationStatus: "blocked", blockedBy: "user" }, "user_to_character"), false);
assert.equal(isBlockedDeliveryDirection({ communicationStatus: "blocked", blockedBy: "character" }, "user_to_character"), true);
assert.equal(isBlockedDeliveryDirection({ communicationStatus: "blocked", blockedBy: "character" }, "character_to_user"), false);

const request = createFriendRequestRecord({
  id: "request-1",
  relation,
  direction: "character_to_user",
  remark: "我想和你重新联系",
  attempt: 2,
  blockCycleId: "cycle-1",
  createdAt: 100,
});
assert.equal(request.status, "pending");
assert.equal(request.attempt, 2);
assert.equal(updateFriendRequestStatus(request, "rejected", "user", 200).handledAt, 200);

const delivery = createBlockedDeliveryRecord({
  id: "blocked-1",
  relationId: relation.id,
  characterId: relation.characterId,
  userIdentityId: relation.userIdentityId,
  direction: "user_to_character",
  content: "这是一条很长的消息".repeat(10),
  kind: "message",
  createdAt: 300,
});
assert.equal(delivery.visibleToUser, true);
assert.match(delivery.summary, /^消息未送达：/u);

console.log("relationshipBlock tests passed");
