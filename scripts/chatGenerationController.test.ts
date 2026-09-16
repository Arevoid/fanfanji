import { strict as assert } from "node:assert";
import { buildComposedAiChatRequest, buildContextRecoveryRequests, generateGroupChatTurn, generateProactiveChatTurn, generateRegeneratedChatTurn, isContextLengthError, requestDirectChatTurn } from "../src/features/chat/controllers/chatGenerationController";
import type { Character, UserSettings } from "../src/types";
import type { apiChat } from "../src/utils/apiHelper";

const settings = { apiKey: "key", selectedModel: "model", apiTemperature: 0.5 } as UserSettings;
const prompt = { scenario: "direct-chat" as const, message: "当前", history: [{ role: "user", text: "历史" }], systemInstruction: "系统", historyInjections: [{ id: "wb", depth: 1, content: "设定" }] };
const request = buildComposedAiChatRequest(prompt, settings);
assert.equal(request.apiKey, "key");
assert.equal(request.model, "model");
assert.equal(request.history[0].role, "system");
assert.equal((request as Record<string, unknown>).diagnostics, undefined);

let capturedMessage = "";
let capturedImageDataUrl: string | undefined;
const directAi = (async (input) => { capturedMessage = input.message; capturedImageDataUrl = input.imageDataUrl; return { text: "回复" }; }) as typeof apiChat;
assert.equal((await requestDirectChatTurn({ prompt, settings, requestAi: directAi })).text, "回复");
assert.equal(capturedMessage, "当前");
await requestDirectChatTurn({
  prompt: { ...prompt, imageDataUrl: "data:image/png;base64,IMAGE" },
  settings,
  requestAi: directAi,
});
assert.equal(capturedImageDataUrl, "data:image/png;base64,IMAGE", "direct provider requests preserve selected visual input");

let aliasGuardAttempts = 0;
let aliasGuardInstruction = "";
const aliasGuardAi = (async (input) => {
  aliasGuardAttempts += 1;
  aliasGuardInstruction = input.systemInstruction || "";
  return { text: aliasGuardAttempts === 1 ? "？宝宝你别吓我，我是步随影啊。" : "你找步随影有什么事？我们好像还不熟。" };
}) as typeof apiChat;
const aliasGuarded = await requestDirectChatTurn({
  prompt: { ...prompt, message: "你是步随影？" },
  settings,
  requestAi: aliasGuardAi,
  aliasIdentityGuard: {
    aliasName: "老莫",
    primaryName: "饭饭",
    hasPrimaryRelationship: true,
    recognitionState: "unknown",
    currentUserMessage: "你是步随影？",
  },
});
assert.equal(aliasGuardAttempts, 2);
assert.equal(aliasGuarded.text, "你找步随影有什么事？我们好像还不熟。");
assert.match(aliasGuardInstruction, /不要使用主号专属的亲昵称呼/);

let formatRecoveryAttempts = 0;
let formatRecoveryInstruction = "";
const malformedFormatAi = (async (input) => {
  formatRecoveryAttempts += 1;
  formatRecoveryInstruction = input.systemInstruction || "";
  return formatRecoveryAttempts === 1
    ? { text: '{"reply":{"unexpected":true}}' }
    : { text: '{"reply":"格式恢复后的回复","innerVoice":{"content":"暂未说出口","emotionalState":"平静"}}' };
}) as typeof apiChat;
const formatRecovered = await requestDirectChatTurn({
  prompt,
  settings,
  requestAi: malformedFormatAi,
  includeInnerVoice: true,
});
assert.equal(formatRecoveryAttempts, 2);
assert.equal(formatRecovered.text, "格式恢复后的回复");
assert.deepEqual(formatRecovered.innerVoice, { content: "暂未说出口", emotionalState: "平静" });
assert.match(formatRecoveryInstruction, /只返回一个合法 JSON 对象/);

let emptyReplyRecoveryAttempts = 0;
const emptyReplyRecovered = await requestDirectChatTurn({
  prompt,
  settings,
  includeInnerVoice: true,
  requestAi: async () => {
    emptyReplyRecoveryAttempts += 1;
    return emptyReplyRecoveryAttempts === 1
      ? { text: '{"reply":"","innerVoice":{"content":"未说出口","emotionalState":"平静"}}' }
      : { text: '{"reply":"空回复修复成功","innerVoice":{"content":"仍未说出口","emotionalState":"平静"}}' };
  },
});
assert.equal(emptyReplyRecoveryAttempts, 2);
assert.equal(emptyReplyRecovered.text, "空回复修复成功");

let plainTextRepairAttempts = 0;
const plainTextRepairRecovered = await requestDirectChatTurn({
  prompt,
  settings,
  includeInnerVoice: true,
  requestAi: async () => {
    plainTextRepairAttempts += 1;
    return plainTextRepairAttempts === 1
      ? { text: '{"innerVoice":{"content":"未说出口","emotionalState":"平静"}}' }
      : plainTextRepairAttempts === 2
        ? { text: "纯文本格式修复成功" }
        : { text: '{"content":"终于把话说清了","emotionalState":"松了口气"}' };
  },
});
assert.equal(plainTextRepairAttempts, 2, "a successful chat reply without inline voice must not trigger a third voice-only request");
assert.equal(plainTextRepairRecovered.text, "纯文本格式修复成功");
assert.equal(plainTextRepairRecovered.innerVoice?.source, "local_fallback");

const missingVoiceRequests: Array<{ purpose?: string; message: string; retryReasons?: readonly string[] }> = [];
const missingVoiceRecovered = await requestDirectChatTurn({
  prompt,
  settings,
  includeInnerVoice: true,
  requestAi: async (input) => {
    missingVoiceRequests.push(input);
    return missingVoiceRequests.length === 1
      ? { text: '{"reply":"这条回复不能丢心声"}' }
      : { text: '{"content":"其实很在意她刚才的话","emotionalState":"嘴上平静，心里微微发紧"}' };
  },
});
assert.equal(missingVoiceRequests.length, 1, "a valid reply without inline voice must not spend tokens on a second request");
assert.equal(missingVoiceRecovered.text, "这条回复不能丢心声", "voice recovery must not replace the actual reply");
assert.equal(missingVoiceRecovered.innerVoice?.source, "local_fallback");
assert.ok(missingVoiceRecovered.innerVoice?.content, "the chat turn still carries a no-token fallback record");
assert.equal(missingVoiceRequests[0].purpose, "chat_reply");

let malformedVoiceRecoveryAttempts = 0;
const malformedVoiceRecovered = await requestDirectChatTurn({
  prompt,
  settings,
  includeInnerVoice: true,
  requestAi: async () => {
    malformedVoiceRecoveryAttempts += 1;
    if (malformedVoiceRecoveryAttempts === 1) return { text: '{"reply":"格式异常时仍保留本轮回复"}' };
    if (malformedVoiceRecoveryAttempts === 2) return { text: '{"content":"缺少情绪字段"}' };
    return { text: '{"content":"把担心藏起来","emotionalState":"略感担忧"}' };
  },
});
assert.equal(malformedVoiceRecoveryAttempts, 1, "malformed/missing inline voice must not issue voice-only retries");
assert.equal(malformedVoiceRecovered.text, "格式异常时仍保留本轮回复");
assert.equal(malformedVoiceRecovered.innerVoice?.source, "local_fallback");

let failedVoiceAttempts = 0;
const failedVoiceRecovered = await requestDirectChatTurn({
  prompt,
  settings,
  includeInnerVoice: true,
  requestAi: async () => {
    failedVoiceAttempts += 1;
    return failedVoiceAttempts === 1
      ? { text: '{"reply":"心声无法生成时不应静默发出"}' }
      : { text: "仍然不是有效心声" };
  },
});
assert.equal(failedVoiceAttempts, 1, "a missing heart voice never repeats the model request");
assert.equal(failedVoiceRecovered.text, "心声无法生成时不应静默发出", "the actual chat reply must survive a missing heart voice");
assert.equal(failedVoiceRecovered.innerVoice?.source, "local_fallback");

assert.equal(isContextLengthError(Object.assign(new Error("request too long"), { code: "context_too_large" })), true);
assert.equal(isContextLengthError(new Error("invalid api key")), false);
const contextHistory = Array.from({ length: 8 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `历史消息 ${index}` }));
const contextRequest = { ...request, history: contextHistory, systemInstruction: "系统" };
const contextRecoveryRequests = buildContextRecoveryRequests(contextRequest);
assert.ok(contextRecoveryRequests.length > 0);
assert.ok(contextRecoveryRequests.every((candidate) => candidate.history.length < contextRequest.history.length));
assert.equal(contextRequest.history.length, 8, "context recovery must not mutate the original request history");

const pinnedHistory = contextHistory.map((entry, index) => index === 1 ? { ...entry, contextPriority: "pinned" as const } : entry);
const oversizedSystem = `核心规则\n\n---\n\n${"冗余设定 ".repeat(4_000)}`;
const oversizedRequest = { ...request, history: pinnedHistory, systemInstruction: oversizedSystem };
const prioritizedRecoveryRequests = buildContextRecoveryRequests(oversizedRequest);
assert.equal(prioritizedRecoveryRequests[0].history.length, pinnedHistory.length, "system prompt is compacted before any dialogue history is removed");
assert.ok(prioritizedRecoveryRequests[0].systemInstruction!.length < oversizedSystem.length);
assert.ok(prioritizedRecoveryRequests.every((candidate) => candidate.history.some((entry) => entry.contextPriority === "pinned")), "explicitly referenced antecedents survive every context recovery tier");
assert.equal(oversizedRequest.history.length, 8, "recovery variants do not mutate request-local history");

const contextAttemptHistoryLengths: number[] = [];
const contextRecoveryAi = (async (input) => {
  contextAttemptHistoryLengths.push(input.history.length);
  if (input.history.length > 2) throw Object.assign(new Error("context window exceeded"), { code: "context_too_large" });
  return { text: "上下文恢复后的回复" };
}) as typeof apiChat;
const contextRecovered = await requestDirectChatTurn({
  prompt: { ...prompt, history: contextHistory },
  settings,
  requestAi: contextRecoveryAi,
});
assert.equal(contextRecovered.text, "上下文恢复后的回复");
assert.ok(contextAttemptHistoryLengths[0] > contextAttemptHistoryLengths.at(-1)!);
assert.equal(contextHistory.length, 8, "context recovery must preserve caller history");

let echoAttempts = 0;
let retryInstruction = "";
const echoAi = (async (input) => {
  echoAttempts += 1;
  retryInstruction = input.systemInstruction || "";
  return { text: echoAttempts === 1 ? "我错了" : "没怪你，过来抱一下" };
}) as typeof apiChat;
const corrected = await requestDirectChatTurn({
  prompt: { ...prompt, message: "老公我错了嘛" },
  settings,
  requestAi: echoAi,
});
assert.equal(echoAttempts, 2);
assert.equal(corrected.text, "没怪你，过来抱一下");
assert.match(retryInstruction, /previous draft was rejected because it copied the user/);

const member = { id: "a", name: "甲", avatar: "", personality: "", backstory: "" } as Character;
const groupAi = (async () => ({ text: JSON.stringify({ replies: [{
  sender: "甲",
  content: "你好",
  innerVoice: { content: "有点想听她继续说", emotionalState: "心里期待，表面自然" },
}] }) })) as typeof apiChat;
const group = await generateGroupChatTurn({ prompt: { ...prompt, scenario: "group-chat" }, settings, members: [member], groupId: "g", disableBracketActions: false, createId: () => "gm", currentTime: () => 1, requestAi: groupAi });
assert.deepEqual(group.messages.map((message) => message.content), ["你好"]);
assert.deepEqual(group.members.map((item) => item.id), ["a"]);

const regenAi = (async () => ({ text: "第一句\n\n第二句" })) as typeof apiChat;
const regen = await generateRegeneratedChatTurn({ prompt: { ...prompt, scenario: "regenerate" }, settings, candidateContext: { disableBracketActions: false, keepPeriods: true, characterId: "a", allowEmoji: false, createId: (index) => `r${index}`, currentTime: (index) => index }, requestAi: regenAi });
assert.equal(regen.candidates?.messages.length, 2);

const proactiveAi = (async () => ({ text: "主动消息" })) as typeof apiChat;
const proactive = await generateProactiveChatTurn({ prompt: { ...prompt, scenario: "proactive-message" }, settings, characterId: "a", disableBracketActions: false, keepPeriods: true, createId: () => "p", currentTime: () => 1, requestAi: proactiveAi });
assert.deepEqual(proactive.messages.map((message) => message.content), ["主动消息"]);

console.log("Chat generation controller: 14 acceptance checks passed");
