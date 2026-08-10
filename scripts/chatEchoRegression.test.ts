import assert from "node:assert/strict";
import fs from "node:fs";
import { requestDirectChatTurn } from "../src/features/chat/controllers/chatGenerationController";
import { isDegenerateDirectReply, isLowInformationUserEcho, removeDegenerateReplyPattern } from "../src/features/chat/services/chatEchoGuard";

const chatSource = fs.readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(chatSource, /\[CURRENT-SCENE CONTINUITY\]/);
assert.doesNotMatch(chatSource, /sceneAnchorTranscript|Recent scene facts:/);

assert.equal(isLowInformationUserEcho("老公我错了嘛", "我错了"), true);
assert.equal(isLowInformationUserEcho("啊？", "啊"), true);
assert.equal(isLowInformationUserEcho("老公我错了嘛", "没怪你，过来抱一下"), false);
assert.equal(isLowInformationUserEcho("晚安", "晚安"), false);
assert.equal(isLowInformationUserEcho("哈哈", "哈哈"), false);

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
