import { strict as assert } from "node:assert";
import { buildGroupMemberPrivateContext, buildIsolatedGroupMemberDefinitions } from "../src/features/chat/prompts/groupMemberPrivateContext";
import type { Character, MemoryItem } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";

const memberA: Character = { id: "a", name: "A", avatar: "", personality: "", backstory: "" };
const memberB: Character = { id: "b", name: "B", avatar: "", personality: "", backstory: "" };
const relationships: CharacterRelationship[] = [
  { id: "rel-a", characterId: "a", userIdentityId: "identity-1", conversationId: "direct:rel-a", relationship: "friend", compressedMemory: "A 与用户共同养猫", createdAt: 1, updatedAt: 1 },
  { id: "rel-b", characterId: "b", userIdentityId: "identity-1", conversationId: "direct:rel-b", relationship: "friend", compressedMemory: "B 与用户约定看电影", createdAt: 1, updatedAt: 1 },
  { id: "rel-a-other", characterId: "a", userIdentityId: "identity-2", conversationId: "direct:rel-a-other", relationship: "friend", compressedMemory: "另一个身份的秘密", createdAt: 1, updatedAt: 1 },
];
const memories: MemoryItem[] = [
  { id: "mem-a", characterId: "a", relationId: "rel-a", content: "A 私聊中知道用户怕雷声", timestamp: 3 },
  { id: "mem-b", characterId: "b", relationId: "rel-b", content: "B 私聊中知道用户喜欢蓝色", timestamp: 2 },
  { id: "mem-a-other", characterId: "a", relationId: "rel-a-other", content: "另一个身份告诉 A 的秘密", timestamp: 4 },
];

const common = {
  characters: [memberA, memberB], relationships, activeIdentityId: "identity-1",
  memories, claims: [], summaries: [], corrections: [], queryText: "", limit: 5,
};
const contextA = buildGroupMemberPrivateContext({ ...common, member: memberA });
const contextB = buildGroupMemberPrivateContext({ ...common, member: memberB });

assert.match(contextA, /A 与用户共同养猫/);
assert.match(contextA, /A 私聊中知道用户怕雷声/);
assert.doesNotMatch(contextA, /B 私聊|另一个身份/);
assert.match(contextB, /B 与用户约定看电影/);
assert.match(contextB, /B 私聊中知道用户喜欢蓝色/);
assert.doesNotMatch(contextB, /A 私聊|另一个身份/);
assert.match(contextA, /其他群成员看不到/);

const isolatedA = buildIsolatedGroupMemberDefinitions({
  publicDefinition: "A 的公开人设",
  publicRoster: ["A", "B"],
  privateContext: contextA,
});
assert.match(isolatedA, /A 的公开人设/);
assert.match(isolatedA, /A 私聊中知道用户怕雷声/);
assert.match(isolatedA, /群成员公开名单：A、B/);
assert.doesNotMatch(isolatedA, /B 私聊中知道用户喜欢蓝色/);

console.log("PASS group member private context stays inside the active identity and relationship");
