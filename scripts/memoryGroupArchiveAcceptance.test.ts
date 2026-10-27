import assert from "node:assert/strict";
import type { Character, Message, UserSettings } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { setGroupMemorySyncEnabled, syncGroupMemoryToMembers } from "../src/features/chat/services/groupMemorySyncService";
import { loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../src/core/storage/repositories/conversationSummaryRepository";
import { runGroupChatReplyPipeline } from "../src/features/chat/services/groupChatReplyPipeline";
import { buildSharedGroupMemoryContext } from "../src/features/chat/prompts/sharedGroupMemoryContext";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
const member = (id: string): Character => ({ id, name: id, personality: "温和", avatar: "", backstory: "" });
const members = [member("a"), member("b")];
const group: Character = { ...member("g"), isGroupChat: true, memberIds: ["a", "b"], groupMemorySyncEnabled: true, contextMemoryLimit: 4 };
const relationships: CharacterRelationship[] = members.map((record) => ({ id: `r-${record.id}`, characterId: record.id, userIdentityId: "u", conversationId: `c-${record.id}`, relationship: "friend", createdAt: 1, updatedAt: 1 }));
const old: Message = { id: "shared-source", characterId: "g", conversationId: "group:g", sender: "user", content: "我们约好周六一起去天文馆看星空展览", timestamp: 100 };
const noise: Message[] = Array.from({ length: 1000 }, (_, n) => ({ ...old, id: `noise-${n}`, content: "哈哈", timestamp: n + 200 }));
const messages = [old, ...noise]; setGroupMemorySyncEnabled(group.id, true);
const synced = syncGroupMemoryToMembers({ group, messages, members, characters: [group, ...members], relationships, activeIdentityId: "u", userName: "用户" });
assert.equal(synced.processed, 2, "1000 trivial messages do not create durable group memories");
const claims = loadKnowledgeClaims().value; const summaries = loadConversationSummaries().value;
const privateClaim = { ...claims[0], id: "private", statement: "用户的私聊秘密", source: { ...claims[0].source, kind: "manual" as const, producer: "manual", evidenceKey: "private" } };
const common = { groupId: "g", members, characters: [group, ...members], relationships, identityId: "u", claims: [...claims, privateClaim], summaries, messages, alreadyPromptedIds: [], query: "天文馆" };
assert.match(buildSharedGroupMemoryContext(common), /约好周六/);
assert.doesNotMatch(buildSharedGroupMemoryContext(common), /私聊秘密/);
assert.equal(buildSharedGroupMemoryContext({ ...common, groupId: "other" }), "");
assert.equal(buildSharedGroupMemoryContext({ ...common, identityId: "other" }), "");
assert.equal(buildSharedGroupMemoryContext({ ...common, members: [...members, member("new")] }), "", "an ungranted member cannot inherit an old archive");
assert.equal(buildSharedGroupMemoryContext({ ...common, query: "如何煮意面" }), "");
assert.equal(buildSharedGroupMemoryContext({ ...common, messages: [noise[0]] }), "", "deleted sources cannot be recalled through stale archives");
assert.equal(buildSharedGroupMemoryContext({ ...common, messages: [{ ...old, content: "约定已改，周六不去天文馆" }] }), "", "edited sources fail the live hash check");
assert.equal(buildSharedGroupMemoryContext({ ...common, alreadyPromptedIds: [old.id] }), "", "recent context is not duplicated by archive recall");
let finalPrompt = "";
await runGroupChatReplyPipeline({ activeCharacter: group, characters: [group, ...members], relationships, activeIdentityId: "u", memories: [], claims: common.claims, summaries, corrections: [],
  worldBookEntries: [], currentMessages: messages, userMessage: { ...old, id: "current", content: "我们之前约好去哪个天文馆来着？", timestamp: 2000 },
  userName: "用户", settings: {} as UserSettings, recallLimit: 5, timeAwarenessEnabled: false, disableBracketActions: false,
  generateTurn: async (input) => { finalPrompt = input.prompt.systemInstruction; return { members, messages: [] }; }, createRouteId: () => "route", createReplyId: () => "reply", currentTime: () => 2000 });
assert.match(finalPrompt, /本群共享归档记录/); assert.match(finalPrompt, /周六一起去天文馆/); assert.doesNotMatch(finalPrompt, /私聊秘密/);
console.log("PASS formal group archive acceptance: 1000-message distance, filtered trivia, exact group/identity and all-member grants, live edit/delete guards, recent dedup and actual final request");
