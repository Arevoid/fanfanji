import { strict as assert } from "node:assert";
import { createGroupTurnMemories } from "../src/features/chat/services/groupMemoryDistribution";
import type { Character, Message } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";

const group: Character = { id: "g", name: "测试群", avatar: "", personality: "", backstory: "", isGroupChat: true, memberIds: ["a", "b"] };
const a: Character = { id: "a", name: "A", avatar: "", personality: "", backstory: "" };
const b: Character = { id: "b", name: "B", avatar: "", personality: "", backstory: "" };
const relationships: CharacterRelationship[] = [
  { id: "ra", characterId: "a", userIdentityId: "identity-1", conversationId: "direct:ra", relationship: "friend", createdAt: 1, updatedAt: 1 },
  { id: "rb", characterId: "b", userIdentityId: "identity-1", conversationId: "direct:rb", relationship: "friend", createdAt: 1, updatedAt: 1 },
  { id: "ra2", characterId: "a", userIdentityId: "identity-2", conversationId: "direct:ra2", relationship: "friend", createdAt: 1, updatedAt: 1 },
];
const userMessage: Message = { id: "u1", characterId: "g", conversationId: "group:g", sender: "user", content: "周六一起去展会", timestamp: 10 };
const replies: Message[] = [
  { id: "m1", characterId: "g", conversationId: "group:g", senderId: "a", sender: "character", content: "我有空", timestamp: 11 },
  { id: "m2", characterId: "g", conversationId: "group:g", senderId: "b", sender: "character", content: "算我一个", timestamp: 12 },
];

const distributed = createGroupTurnMemories({
  group, members: [a, b], characters: [group, a, b], relationships,
  activeIdentityId: "identity-1", userName: "用户", userMessage, replies, timestamp: 20,
});

assert.equal(distributed.length, 2);
assert.deepEqual(distributed.map((memory) => memory.relationId).sort(), ["ra", "rb"]);
assert.equal(distributed.some((memory) => memory.relationId === "ra2"), false);
assert.equal(distributed.every((memory) => memory.content.includes("用户：周六一起去展会")), true);
assert.equal(distributed.every((memory) => memory.content.includes("A：我有空") && memory.content.includes("B：算我一个")), true);
assert.equal(distributed.every((memory) => memory.content.includes("测试群")), true);

console.log("PASS public group turn is distributed once per active-identity member relationship");
