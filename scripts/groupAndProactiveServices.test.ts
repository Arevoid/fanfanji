import { strict as assert } from "node:assert";
import { generateGroupReplyCandidates } from "../src/features/chat/services/groupChatService";
import { generateProactiveReplyCandidates } from "../src/features/chat/services/proactiveMessageService";
import { matchGroupReplyMembers, parseGroupReplies } from "../src/features/chat/services/groupReplyParser";
import type { Character } from "../src/types";
import type { AiChatRequest } from "../src/features/chat/services/chatServiceTypes";

const memberA: Character = { id: "a", name: "A", avatar: "", personality: "", backstory: "" };
const memberB: Character = { id: "b", name: "B", avatar: "", personality: "", backstory: "" };
const outsider: Character = { id: "x", name: "X", avatar: "", personality: "", backstory: "" };
const request: AiChatRequest = { message: "group", history: [], systemInstruction: "time boundary memories", apiKey: "test", model: "test" };
let groupRequests = 0;
const group = await generateGroupReplyCandidates({
  requestAi: async () => { groupRequests += 1; return { text: "[SENDER_NAME: A]\n你好。\n[SENDER_NAME: B]\n收到！\n[SENDER_NAME: X]\n泄露" }; },
  request, members: [memberA, memberB], groupId: "group", disableBracketActions: false,
  createId: (index) => `g-${index}`, currentTime: () => 10,
});

// A-H: group parser, membership boundary, order, fields, and one request.
assert.equal(groupRequests, 1);
assert.deepEqual(parseGroupReplies("[SENDER_NAME: A]\n你好").map((reply) => reply.charName), ["A"]);
assert.equal(matchGroupReplyMembers(parseGroupReplies("[SENDER_NAME: X]\nx"), [memberA, memberB]).length, 0);
assert.deepEqual(group.messages.map((message) => message.content), ["你好。", "收到！"]);
assert.deepEqual(group.messages.map((message) => message.senderId), ["a", "b"]);
assert.deepEqual(group.messages.map((message) => message.characterId), ["group", "group"]);
assert.deepEqual(group.messages.map((message) => message.conversationId), ["group:group", "group:group"]);
assert.equal(group.messages.length, 2);
assert.equal(group.members.includes(outsider), false);

// Repeated sender blocks are intentional: a member may send multiple short
// messages in one natural group interaction, without another AI request.
let multiTurnRequests = 0;
const multiTurn = await generateGroupReplyCandidates({
  requestAi: async () => {
    multiTurnRequests += 1;
    return { text: "[SENDER_NAME: A]\n先回应一下\n[SENDER_NAME: B]\n我同意\n[SENDER_NAME: A]\n再补充一句" };
  },
  request, members: [memberA, memberB], groupId: "group", disableBracketActions: false,
  createId: (index) => `multi-${index}`, currentTime: () => 11,
});
assert.equal(multiTurnRequests, 1);
assert.deepEqual(multiTurn.messages.map((message) => message.content), ["先回应一下", "我同意", "再补充一句"]);
assert.deepEqual(multiTurn.messages.map((message) => message.senderId), ["a", "b", "a"]);

let proactiveRequests = 0;
const proactive = await generateProactiveReplyCandidates({
  requestAi: async () => { proactiveRequests += 1; return { text: "接着刚才的话。\n[红包]|1|hi" }; },
  request: { ...request, message: "proactive", systemInstruction: "time boundary no moments group" },
  characterId: "a", disableBracketActions: false, keepPeriods: false,
  createId: (index) => `p-${index}`, currentTime: (index) => 20 + index,
});

// I-T: both proactive paths share parsing/candidates and carry caller-prepared context without extra requests.
assert.equal(proactiveRequests, 1);
assert.deepEqual(proactive.messages.map((message) => message.content), ["接着刚才的话", "[红包]|1.00|hi"]);
assert.deepEqual(proactive.messages.map((message) => message.timestamp), [20, 21]);
assert.deepEqual(proactive.messages.map((message) => message.characterId), ["a", "a"]);
assert.equal(proactive.data.text?.includes("接着"), true);
assert.equal(request.systemInstruction.includes("time"), true);
assert.equal(request.systemInstruction.includes("boundary"), true);
assert.equal(proactive.messages.some((message) => message.characterId === "group"), false);
assert.equal((await generateProactiveReplyCandidates({ ...{
  requestAi: async () => ({ text: "" }), request, characterId: "a", disableBracketActions: false, keepPeriods: false,
  createId: (index: number) => `${index}`, currentTime: (index: number) => index,
} })).messages.length, 0);
assert.equal((await generateProactiveReplyCandidates({
  requestAi: async () => ({ text: "[消息发送于 2026-08-02 18:11]" }),
  request,
  characterId: "a",
  disableBracketActions: false,
  keepPeriods: false,
  createId: (index: number) => `${index}`,
  currentTime: (index: number) => index,
})).messages.length, 0);
await assert.rejects(() => generateProactiveReplyCandidates({ requestAi: async () => { throw new Error("failed"); }, request, characterId: "a", disableBracketActions: false, keepPeriods: false, createId: (index) => `${index}`, currentTime: (index) => index }), /failed/);
assert.equal(proactiveRequests, 1);
assert.equal(groupRequests, 1);
assert.equal(group.messages.every((message) => message.sender === "character"), true);
assert.equal(proactive.messages.every((message) => message.sender === "character"), true);
assert.equal(proactive.messages.length, 2);

console.log("Group and proactive services: 22 fixed acceptance checks passed");
