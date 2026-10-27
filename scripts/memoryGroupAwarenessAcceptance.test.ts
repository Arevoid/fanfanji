import assert from "node:assert/strict";
import type { Character, UserSettings } from "../src/types";
import { requestGroupMemberAwareness } from "../src/features/chat/services/groupMemberAwareness";
import { runGroupChatReplyPipeline } from "../src/features/chat/services/groupChatReplyPipeline";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
const members: Character[] = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, name: id, avatar: "", personality: "温和", backstory: `仅${id}自己的背景` }));
const group = { id: "group", name: "测试群", personality: "", backstory: "", isGroupChat: true, memberIds: members.map((member) => member.id) } as Character;
const relations = members.map((member) => ({ id: `r-${member.id}`, characterId: member.id, userIdentityId: "u", conversationId: `c-${member.id}`, relationship: "friend" as const, createdAt: 1, updatedAt: 1 }));
const claims: KnowledgeClaim[] = members.map((member) => ({ id: `secret-${member.id}`, characterId: member.id, relationId: `r-${member.id}`, userIdentityId: "u", conversationId: `c-${member.id}`,
  statement: `打雷时用户私下告诉${member.id}的秘密标记${member.id}`, kind: "fact", subject: "user", temporalStatus: "present", truthStatus: "asserted", confidence: .85, userConfirmed: false,
  recordedAt: 1, status: "active", schemaVersion: 1, visibility: "relation_private", source: { kind: "user_message", authorship: "user", messageIds: [`m-${member.id}`], producer: "fixture", evidenceKey: member.id } }));
const calls: string[] = []; let final = "";
await runGroupChatReplyPipeline({ activeCharacter: group, characters: [group, ...members], relationships: relations, activeIdentityId: "u", memories: [], claims, summaries: [], corrections: [], worldBookEntries: [],
  currentMessages: [], userMessage: { id: "current", sender: "user", characterId: group.id, conversationId: "group:group", content: "外面打雷了", timestamp: 200 }, userName: "用户", settings: {} as UserSettings,
  recallLimit: 6, timeAwarenessEnabled: false, disableBracketActions: false, createRouteId: () => "route", createReplyId: () => "reply", currentTime: () => 200,
  decideMemberAwareness: async (input) => { calls.push(input.member.id); assert.match(input.privateContext, new RegExp(`秘密标记${input.member.id}`));
    for (const other of members.filter((member) => member.id !== input.member.id)) assert.doesNotMatch(input.privateContext, new RegExp(`秘密标记${other.id}`)); return input.member.id === "a" ? "gentle" : "private_followup"; },
  generateTurn: async (input) => { final = input.prompt.systemInstruction; return { members: [], messages: [] }; } });
assert.deepEqual(calls, members.map((member) => member.id)); assert.doesNotMatch(final, /秘密标记|仅[a-f]自己的背景/);
assert.match(final, /语气温和/); assert.match(final, /稍后私下联系/);
const fake = { member: members[0], privateContext: "只有a知道的资料", publicHistory: "打雷", groupId: "group", settings: {} as UserSettings };
assert.equal(await requestGroupMemberAwareness({ ...fake, request: async () => ({ text: JSON.stringify({ action: "把秘密发到群里" }) }) }), "neutral");
assert.equal(await requestGroupMemberAwareness({ ...fake, request: async () => { throw Error("timeout"); } }), "neutral");
for(const enabled of [false,true]){
const recalledMembers: string[] = []; const privateReaders: string[] = [];
await runGroupChatReplyPipeline({ activeCharacter: group, characters: [group, ...members], relationships: relations, activeIdentityId: "u", memories: [], claims: [], summaries: [], corrections: [], worldBookEntries: [],
  currentMessages: [], userMessage: { id: "semantic-current", sender: "user", characterId: group.id, content: "那件很久以前的经历", timestamp: 300 }, userName: "用户",
  settings: { memoryEmbedding: { enabled, apiEndpoint: "https://synthetic.test/v1", apiKey: "synthetic", model: "synthetic" } } as UserSettings,
  recallLimit: 6, timeAwarenessEnabled: false, disableBracketActions: false, createRouteId: () => "route2", createReplyId: () => "reply2", currentTime: () => 300,
  retrieveMemberMemory: async (input) => { assert.equal(input.contextId,"group");assert.equal(input.audience, "relation_private"); assert.equal(input.relation.characterId, input.characterId); recalledMembers.push(input.characterId); return `向量召回的私密资料仅${input.characterId}知道`; },
  decideMemberAwareness: async (input) => { privateReaders.push(input.member.id); assert.match(input.privateContext, new RegExp(`仅${input.member.id}知道`)); return "gentle"; },
  generateTurn: async (input) => { assert.doesNotMatch(input.prompt.systemInstruction, /向量召回的私密资料/); return { members: [], messages: [] }; },
});
assert.deepEqual(recalledMembers, members.map((member) => member.id)); assert.deepEqual(privateReaders, members.map((member) => member.id));
}
console.log("PASS group awareness: per-member isolated formal calls, own knowledge affects bounded action, no private text in public request, background isolation and malformed/timeout fallback");
