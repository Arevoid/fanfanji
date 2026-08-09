import { strict as assert } from "node:assert";
import { buildComposedAiChatRequest, generateGroupChatTurn, generateProactiveChatTurn, generateRegeneratedChatTurn, requestDirectChatTurn } from "../src/features/chat/controllers/chatGenerationController";
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
const directAi = (async (input) => { capturedMessage = input.message; return { text: "回复" }; }) as typeof apiChat;
assert.equal((await requestDirectChatTurn({ prompt, settings, requestAi: directAi })).text, "回复");
assert.equal(capturedMessage, "当前");

const member = { id: "a", name: "甲", avatar: "", personality: "", backstory: "" } as Character;
const groupAi = (async () => ({ text: "[SENDER_NAME: 甲]\n你好" })) as typeof apiChat;
const group = await generateGroupChatTurn({ prompt: { ...prompt, scenario: "group-chat" }, settings, members: [member], groupId: "g", disableBracketActions: false, createId: () => "gm", currentTime: () => 1, requestAi: groupAi });
assert.deepEqual(group.messages.map((message) => message.content), ["你好"]);
assert.deepEqual(group.members.map((item) => item.id), ["a"]);

const regenAi = (async () => ({ text: "第一句\n第二句" })) as typeof apiChat;
const regen = await generateRegeneratedChatTurn({ prompt: { ...prompt, scenario: "regenerate" }, settings, candidateContext: { disableBracketActions: false, keepPeriods: true, characterId: "a", allowEmoji: false, createId: (index) => `r${index}`, currentTime: (index) => index }, requestAi: regenAi });
assert.equal(regen.candidates?.messages.length, 2);

const proactiveAi = (async () => ({ text: "主动消息" })) as typeof apiChat;
const proactive = await generateProactiveChatTurn({ prompt: { ...prompt, scenario: "proactive-message" }, settings, characterId: "a", disableBracketActions: false, keepPeriods: true, createId: () => "p", currentTime: () => 1, requestAi: proactiveAi });
assert.deepEqual(proactive.messages.map((message) => message.content), ["主动消息"]);

console.log("Chat generation controller: 11 acceptance checks passed");
