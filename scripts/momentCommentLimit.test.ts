import assert from "node:assert/strict";
import type { MomentComment } from "../src/types";
import {
  MAX_MOMENT_COMMENTS_PER_ACTOR,
  countMomentCommentsForActor,
  hasReachedMomentCommentLimit,
  limitMomentCommentsPerActor,
} from "../src/features/moments/services/momentCommentLimit";
import { upsertMomentPreservingOrder } from "../src/features/moments/services/momentState";
import type { Moment } from "../src/types";

const npcComments: MomentComment[] = Array.from({ length: 10 }, (_, index) => ({
  id: `npc-${index}`,
  sourceNpcId: "npc-a",
  relationId: "relation-a",
  characterId: "character-a",
  authorName: "小顾",
  authorAvatar: "",
  content: `NPC ${index}`,
  timestamp: index,
  ...(index > 0 ? { replyToCommentId: `npc-${index - 1}` } : {}),
}));
const userComment: MomentComment = {
  id: "user-1",
  authorName: "我",
  authorAvatar: "",
  content: "用户评论仍然保留",
  timestamp: 20,
};
const rolePhoneUserComments: MomentComment[] = Array.from({ length: 12 }, (_, index) => ({
  id: `role-phone-user-${index}`,
  relationId: "relation-a",
  authorName: "我",
  authorAvatar: "",
  content: `用户留言 ${index}`,
  timestamp: 30 + index,
}));

const kept = limitMomentCommentsPerActor([...npcComments, userComment]);
assert.equal(kept.filter((comment) => comment.sourceNpcId === "npc-a").length, MAX_MOMENT_COMMENTS_PER_ACTOR);
assert.equal(kept.some((comment) => comment.id === userComment.id), true);
assert.equal(limitMomentCommentsPerActor(rolePhoneUserComments).length, rolePhoneUserComments.length, "带关系 ID 的用户留言不能被当作 NPC 评论限流");
assert.equal(countMomentCommentsForActor(kept, {
  sourceNpcId: "npc-a",
  relationId: "relation-a",
  characterId: "character-a",
  authorName: "小顾",
}), MAX_MOMENT_COMMENTS_PER_ACTOR);
assert.equal(hasReachedMomentCommentLimit(kept, {
  sourceNpcId: "npc-a",
  relationId: "relation-a",
  characterId: "character-a",
  authorName: "小顾",
}), true);

const partialLegacyComments = npcComments.slice(0, 4).map(({ relationId: _relationId, ...comment }) => comment);
const partialCurrentComments = npcComments.slice(4, 10).map(({ characterId: _characterId, ...comment }) => comment);
assert.equal(limitMomentCommentsPerActor([...partialLegacyComments, ...partialCurrentComments]).length, MAX_MOMENT_COMMENTS_PER_ACTOR);

const secondNpcComments = npcComments.map((comment, index) => ({
  ...comment,
  id: `npc-b-${index}`,
  sourceNpcId: "npc-b",
  authorName: "小林",
}));
const twoNpcKept = limitMomentCommentsPerActor([...npcComments, ...secondNpcComments]);
assert.equal(twoNpcKept.filter((comment) => comment.sourceNpcId === "npc-a").length, MAX_MOMENT_COMMENTS_PER_ACTOR);
assert.equal(twoNpcKept.filter((comment) => comment.sourceNpcId === "npc-b").length, MAX_MOMENT_COMMENTS_PER_ACTOR);

const moment: Moment = {
  id: "moment-1",
  authorName: "我",
  authorAvatar: "",
  content: "一条动态",
  timestamp: 1,
  likes: [],
  comments: npcComments,
};
const updated = upsertMomentPreservingOrder([moment], { ...moment, comments: [userComment] });
assert.equal(updated[0].comments.filter((comment) => comment.sourceNpcId === "npc-a").length, MAX_MOMENT_COMMENTS_PER_ACTOR);
assert.equal(updated[0].comments.some((comment) => comment.id === userComment.id), true);

console.log("moment comment actor limit tests passed");
