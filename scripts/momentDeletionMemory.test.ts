import assert from "node:assert/strict";
import type { MemoryItem, Moment } from "../src/types";
import { isMomentMemoryFor, removeMemoriesForMoment } from "../src/features/moments/services/momentMemory";

const moment: Moment = {
  id: "moment-1",
  characterId: "character-1",
  relationId: "relation-1",
  authorName: "角色",
  authorAvatar: "avatar.png",
  content: "今天的动态",
  timestamp: 1_700_000_000_000,
  likes: [],
  comments: [],
};

const linkedMemory: MemoryItem = {
  id: "linked-memory",
  characterId: moment.characterId!,
  relationId: moment.relationId,
  sourceMomentId: moment.id,
  content: "自动朋友圈记忆",
  timestamp: moment.timestamp,
};
const legacyGeneratedMemory: MemoryItem = {
  id: `${moment.timestamp}-moment-memory-legacy`,
  characterId: moment.characterId!,
  relationId: moment.relationId,
  content: "旧版本自动朋友圈记忆",
  timestamp: moment.timestamp,
};
const ordinaryMemory: MemoryItem = {
  id: "ordinary-memory",
  characterId: moment.characterId!,
  relationId: moment.relationId,
  content: "普通聊天记忆",
  timestamp: moment.timestamp,
};

assert.equal(isMomentMemoryFor(linkedMemory, moment), true);
assert.equal(isMomentMemoryFor(legacyGeneratedMemory, moment), true);
assert.equal(isMomentMemoryFor(ordinaryMemory, moment), false);
assert.deepEqual(
  removeMemoriesForMoment([linkedMemory, legacyGeneratedMemory, ordinaryMemory], moment).map((memory) => memory.id),
  [ordinaryMemory.id],
);

console.log("PASS Moment deletion removes linked and legacy generated memories without removing ordinary memories");
