import assert from "node:assert/strict";
import fs from "node:fs";
import { requestDirectChatTurn } from "../src/features/chat/controllers/chatGenerationController";
import { getVisibleEchoCheckText, isDegenerateDirectReply, isLowInformationUserEcho, isRepeatedCharacterTurn, removeDegenerateReplyPattern } from "../src/features/chat/services/chatEchoGuard";
import { formatCurrentVoiceMessagePrompt, formatVoiceMessageHistory } from "../src/features/chat/prompts/voiceMessagePrompt";
import { CURRENT_SCENE_CONTINUITY_PROMPT } from "../src/features/chat/prompts/directChatTurnPrompt";

const chatSource = fs.readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(CURRENT_SCENE_CONTINUITY_PROMPT, /\[CURRENT-SCENE CONTINUITY\]/);
assert.equal((chatSource.match(/assembledInstructions\.push\(CURRENT_SCENE_CONTINUITY_PROMPT\)/g) || []).length, 2);
assert.doesNotMatch(chatSource, /sceneAnchorTranscript|Recent scene facts:/);

assert.equal(isLowInformationUserEcho("老公我错了嘛", "我错了"), true);
assert.equal(isLowInformationUserEcho("啊？", "啊"), true);
assert.equal(isLowInformationUserEcho("老公我错了嘛", "没怪你，过来抱一下"), false);
assert.equal(isLowInformationUserEcho("晚安", "晚安"), false);
assert.equal(isLowInformationUserEcho("哈哈", "哈哈"), false);
const voicePrompt = formatCurrentVoiceMessagePrompt("[语音]|1|老公～") || "";
assert.match(voicePrompt, /same conversation/i);
assert.match(voicePrompt, /does not start a new topic/i);
assert.match(voicePrompt, /Do not merely repeat/);
assert.equal(voicePrompt.endsWith("老公～"), true);
assert.equal(formatVoiceMessageHistory("[语音]|1|老公～"), "[语音消息，1秒；准确转写，与前后文字属于同一段对话]\n老公～");
assert.equal(getVisibleEchoCheckText("“老公”\n（学你说话）"), "老公");
assert.equal(isDegenerateDirectReply(voicePrompt, "“老公”\n（学你说话）"), true, "visible post-cleaning voice echo must be rejected");
assert.equal(
  isDegenerateDirectReply("你看过《凡人修仙传》吗？", "你看过《凡人修仙传》吗？\n看"),
  true,
  "an echoed first bubble must not be hidden by a later answer bubble",
);
assert.equal(
  isDegenerateDirectReply("你看过《凡人修仙传》吗？", "看过，动画和小说都接触过"),
  false,
  "a direct answer must remain valid",
);

const repeatedSingleCharacterHistory = [
  { role: "user", text: "在吗" },
  { role: "model", text: "可" },
  { role: "user", text: "啊？" },
];
assert.equal(isDegenerateDirectReply("啊？", "可", repeatedSingleCharacterHistory), true);
assert.equal(isDegenerateDirectReply("好", "好", repeatedSingleCharacterHistory), false);
assert.deepEqual(removeDegenerateReplyPattern(repeatedSingleCharacterHistory, "可"), [
  { role: "user", text: "在吗" },
  { role: "user", text: "啊？" },
]);

const settings = { apiKey: "test", selectedModel: "test" } as any;
const prompt = {
  scenario: "direct-chat" as const,
  message: "可…",
  history: repeatedSingleCharacterHistory,
  systemInstruction: "保持角色口吻。",
};

const repeatedTurnHistory = [
  { role: "user", text: "嗯对，我又跑了" },
  { role: "model", text: "你又跑了？" },
  { role: "model", text: "这次怎么跑的？" },
];
assert.equal(isRepeatedCharacterTurn("你又跑了？\n这次怎么跑的？", repeatedTurnHistory), true);
assert.equal(isDegenerateDirectReply("？", "你又跑了？\n这次怎么跑的？", repeatedTurnHistory), true);
assert.equal(isRepeatedCharacterTurn("嗯", [{ role: "model", text: "嗯" }]), false, "short reciprocal replies remain natural");
assert.deepEqual(removeDegenerateReplyPattern(repeatedTurnHistory, "你又跑了？\n这次怎么跑的？"), [
  { role: "user", text: "嗯对，我又跑了" },
]);

let repeatedTurnCalls = 0;
const repeatedTurnCorrected = await requestDirectChatTurn({
  prompt: { ...prompt, message: "？", history: repeatedTurnHistory },
  settings,
  requestAi: (async (request: any) => {
    repeatedTurnCalls += 1;
    if (repeatedTurnCalls === 1) return { text: "你又跑了？\n这次怎么跑的？" };
    assert.equal(request.history.some((entry: any) => entry.role === "model"), false);
    assert.match(request.systemInstruction, /previous character bubbles verbatim/i);
    return { text: "我是没明白你刚才说的‘跑了’具体指什么" };
  }) as any,
});
assert.equal(repeatedTurnCalls, 2);
assert.equal(repeatedTurnCorrected.text, "我是没明白你刚才说的‘跑了’具体指什么");

let calls = 0;
const corrected = await requestDirectChatTurn({
  prompt,
  settings,
  requestAi: (async (request: any) => {
    calls += 1;
    if (calls === 1) return { text: "可" };
    assert.equal(request.history.some((entry: any) => entry.role === "model" && entry.text === "可"), false);
    return { text: "怎么突然这么说，出什么事了？" };
  }) as any,
});
assert.equal(calls, 2);
assert.equal(corrected.text, "怎么突然这么说，出什么事了？");

let multiBubbleCalls = 0;
const multiBubbleCorrected = await requestDirectChatTurn({
  prompt: { ...prompt, message: "你看过《凡人修仙传》吗？", history: [] },
  settings,
  requestAi: (async (request: any) => {
    multiBubbleCalls += 1;
    if (multiBubbleCalls === 1) return { text: "你看过《凡人修仙传》吗？\n看" };
    assert.match(request.systemInstruction, /do not first repeat, quote, or paraphrase/i);
    return { text: "看过，动画和小说都接触过" };
  }) as any,
});
assert.equal(multiBubbleCalls, 2);
assert.equal(multiBubbleCorrected.text, "看过，动画和小说都接触过");

const precedingConversation = [
  { role: "user", text: "那我们就在门口见" },
  { role: "model", text: "好，我在门口等你" },
];
let voiceCalls = 0;
const voiceCorrected = await requestDirectChatTurn({
  prompt: { scenario: "direct-chat", message: voicePrompt, history: precedingConversation, systemInstruction: "保持当前对话连续。" },
  settings,
  requestAi: (async (request: any) => {
    voiceCalls += 1;
    assert.equal(request.history.some((entry: any) => entry.text === "好，我在门口等你"), true, "voice retry must retain preceding text history");
    return voiceCalls === 1 ? { text: "“老公”\n（学你说话）" } : { text: "怎么突然这么叫我……不是说好在门口见吗" };
  }) as any,
});
assert.equal(voiceCalls, 2);
assert.equal(voiceCorrected.text, "怎么突然这么叫我……不是说好在门口见吗");

await assert.rejects(
  requestDirectChatTurn({ prompt, settings, requestAi: (async () => ({ text: "可" })) as any }),
  /本次回复已停止写入/,
);

await assert.rejects(
  requestDirectChatTurn({
    prompt: { ...prompt, message: "啊？" },
    settings,
    requestAi: (async () => ({ text: "可" })) as any,
  }),
  /本次回复已停止写入/,
);

console.log("chat echo regression tests passed");
