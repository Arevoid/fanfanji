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
import { buildAdaptiveFriendRequestRemark } from "../src/domain/relationship/friendRequestRemark";
import { buildAdaptiveCharacterBlockReaction } from "../src/domain/relationship/blockReaction";

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

const character = {
  personality: "嘴硬但很在意关系，遇到冲突时不愿意示弱",
  backstory: "和亲近的人吵架后仍然希望把话说清楚",
};
const conflictMessages = [{
  id: "message-conflict",
  characterId: relation.characterId,
  sender: "user" as const,
  content: "我们刚刚还在吵架，你怎么又不理我了？",
  timestamp: 900,
}];
const conflictRemark = buildAdaptiveFriendRequestRemark({
  character,
  relationship: { relationship: "close_friend" },
  recentMessages: conflictMessages,
  attempt: 1,
  now: 1000,
});
const neutralRemark = buildAdaptiveFriendRequestRemark({
  character: { personality: "冷静理性", backstory: "不喜欢情绪化争执" },
  relationship: { relationship: "friend" },
  recentMessages: [],
  attempt: 1,
  now: 1000,
});
const retryRemark = buildAdaptiveFriendRequestRemark({
  character,
  relationship: { relationship: "close_friend" },
  recentMessages: conflictMessages,
  attempt: 2,
  now: 1000,
});
assert.match(conflictRemark, /生气|吵架|拉黑|说清楚|解释/u);
assert.match(neutralRemark, /原因|发生了什么|拉黑/u);
assert.notEqual(conflictRemark, neutralRemark);
assert.notEqual(conflictRemark, retryRemark);
const blockReaction = buildAdaptiveCharacterBlockReaction({
  character,
  relationship: { relationship: "close_friend" },
  recentMessages: conflictMessages,
  requestCreated: true,
  attempt: 1,
  now: 1000,
});
assert.equal(blockReaction.length, 2);
assert.match(blockReaction[0], /生气|拉黑|说清楚|解释/u);
assert.notEqual(blockReaction[1], "我先给你发好友申请，你记得看看。", "拉黑反应不能退回统一模板");

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
