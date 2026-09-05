import { strict as assert } from "node:assert";
import { buildGroupMemberPrivateContext, buildIsolatedGroupMemberDefinitions } from "../src/features/chat/prompts/groupMemberPrivateContext";
import type { Character } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { createManualKnowledgeClaim } from "../src/features/characterKnowledge/services/manualKnowledgeService";

const memberA: Character = { id: "a", name: "A", avatar: "", personality: "", backstory: "" };
const memberB: Character = { id: "b", name: "B", avatar: "", personality: "", backstory: "" };
const relationships: CharacterRelationship[] = [
  { id: "rel-a", characterId: "a", userIdentityId: "identity-1", conversationId: "direct:rel-a", relationship: "friend", compressedMemory: "A 与用户共同养猫", createdAt: 1, updatedAt: 1 },
  { id: "rel-b", characterId: "b", userIdentityId: "identity-1", conversationId: "direct:rel-b", relationship: "friend", compressedMemory: "B 与用户约定看电影", createdAt: 1, updatedAt: 1 },
  { id: "rel-a-other", characterId: "a", userIdentityId: "identity-2", conversationId: "direct:rel-a-other", relationship: "friend", compressedMemory: "另一个身份的秘密", createdAt: 1, updatedAt: 1 },
];
const claims = [
  createManualKnowledgeClaim({
    id: "claim-a",
    scope: { relationId: "rel-a", characterId: "a", userIdentityId: "identity-1", conversationId: "direct:rel-a" },
    statement: "A 私聊中知道用户怕雷声",
    sourceRecordId: "message-a",
    recordedAt: 3,
  }),
  createManualKnowledgeClaim({
    id: "claim-b",
    scope: { relationId: "rel-b", characterId: "b", userIdentityId: "identity-1", conversationId: "direct:rel-b" },
    statement: "B 私聊中知道用户喜欢蓝色",
    sourceRecordId: "message-b",
    recordedAt: 2,
  }),
  createManualKnowledgeClaim({
    id: "claim-a-other",
    scope: { relationId: "rel-a-other", characterId: "a", userIdentityId: "identity-2", conversationId: "direct:rel-a-other" },
    statement: "另一个身份告诉 A 的秘密",
    sourceRecordId: "message-a-other",
    recordedAt: 4,
  }),
].filter((claim): claim is NonNullable<typeof claim> => Boolean(claim));

const common = {
  characters: [memberA, memberB], relationships, activeIdentityId: "identity-1",
  claims, summaries: [], corrections: [], queryText: "", limit: 5,
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
