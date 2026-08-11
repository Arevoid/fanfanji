import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDirectChatMainPrompt,
  buildRedPacketReactionPrompt,
  buildStickerResponsePrompt,
  buildTimeAwarenessPrompt,
  buildVoiceCallPrompts,
  buildVoiceIntervalPrompt,
  CURRENT_SCENE_CONTINUITY_PROMPT,
  detectCallTopicShift,
  NEW_DAY_CONVERSATION_BOUNDARY_PROMPT,
} from "../src/features/chat/prompts/directChatTurnPrompt";

const mainPrompt = buildDirectChatMainPrompt({ characterName: "测试角色", disableBracketActions: false });
assert.match(mainPrompt, /RED PACKET CAPABILITY/);
assert.match(mainPrompt, /unless that is your explicit character人设/);
assert.match(mainPrompt, /ordinary greeting or short message/);
assert.match(buildDirectChatMainPrompt({ characterName: "测试角色", disableBracketActions: true }), /pure conversational speech/);

const timePrompt = buildTimeAwarenessPrompt(new Date("2026-08-11T08:30:00+08:00"), "HISTORY_MARK");
assert.match(timePrompt, /HISTORY_MARK/);
assert.match(timePrompt, /不能统一强制礼貌或亲密/);
assert.match(timePrompt, /不要强制追问行程、表达想念/);
assert.doesNotMatch(timePrompt, /绝对要表现得像过完一夜/);

assert.match(NEW_DAY_CONVERSATION_BOUNDARY_PROMPT, /Do not resume/);
assert.match(CURRENT_SCENE_CONTINUITY_PROMPT, /Never silently replace one activity/);
assert.match(buildRedPacketReactionPrompt("[红包]|6.66|开心"), /¥6\.66/);
assert.match(buildRedPacketReactionPrompt("[红包]|6.66|开心"), /开心/);
assert.match(buildStickerResponsePrompt("[表情]|笑|url"), /\[表情\]\|笑\|url/);

const recentVoice = {
  id: "voice-1",
  characterId: "c1",
  sender: "character",
  content: "[语音]|2|刚刚说过的话",
  timestamp: new Date("2026-08-11T08:28:00+08:00").getTime(),
} as const;
const currentVoice = {
  id: "voice-2",
  characterId: "c1",
  sender: "user",
  content: "[语音]|1|再说一句",
  timestamp: new Date("2026-08-11T08:30:00+08:00").getTime(),
  isVoiceMessage: true,
} as const;
const voicePrompt = buildVoiceIntervalPrompt({
  characterName: "测试角色",
  currentMessage: currentVoice as any,
  recentMessages: [recentVoice as any],
  nowMs: new Date("2026-08-11T08:30:00+08:00").getTime(),
});
assert.match(voicePrompt, /短时间连续/);
assert.match(voicePrompt, /刚刚说过的话/);
assert.equal(buildVoiceIntervalPrompt({ characterName: "测试角色", currentMessage: undefined, recentMessages: [] }), "");

assert.equal(detectCallTopicShift({
  isConnectedVoiceCall: true,
  userText: "我们换个话题聊量子物理",
  callTranscript: [{ content: "晚饭吃什么" }, { content: "想吃面条" }],
}), true);
assert.equal(detectCallTopicShift({
  isConnectedVoiceCall: true,
  userText: "那就吃面条吧",
  callTranscript: [{ content: "晚饭吃什么" }, { content: "想吃面条" }],
}), false);
assert.match(buildVoiceCallPrompts(false).join("\n"), /not loaded for this turn/);
assert.match(buildVoiceCallPrompts(true).join("\n"), /available because the user shifted/);

const appChatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
for (const pattern of [
  /buildDirectChatMainPrompt\(/g,
  /buildTimeAwarenessPrompt\(/g,
  /buildVoiceIntervalPrompt\(/g,
  /assembledInstructions\.push\(CURRENT_SCENE_CONTINUITY_PROMPT\)/g,
]) {
  assert.equal((appChatSource.match(pattern) || []).length, 2, `${pattern} must be shared by send and regeneration`);
}
assert.equal((appChatSource.match(/if \(musicContext\) assembledInstructions\.push\(musicContext\)/g) || []).length, 2);
assert.equal((appChatSource.match(/if \(forumContext\) assembledInstructions\.push\(forumContext\)/g) || []).length, 2);
assert.equal((appChatSource.match(/if \(diaryContext\) assembledInstructions\.push\(diaryContext\)/g) || []).length, 2);
assert.equal((appChatSource.match(/NEW_DAY_CONVERSATION_BOUNDARY_PROMPT/g) || []).length >= 3, true);
assert.equal((appChatSource.match(/buildVoiceCallPrompts\(callTopicShiftDetected\)/g) || []).length, 2);

console.log("Direct chat turn prompt parity tests passed");
