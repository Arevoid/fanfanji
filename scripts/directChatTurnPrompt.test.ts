import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDirectChatMainPrompt,
  buildCrossDayHistoricalReferencePrompt,
  buildRedPacketReactionPrompt,
  buildStickerResponsePrompt,
  buildTimeAwarenessPrompt,
  buildVoiceCallPrompts,
  buildVoiceIntervalPrompt,
  CURRENT_SCENE_CONTINUITY_PROMPT,
  detectCallTopicShift,
  NEW_DAY_CONVERSATION_BOUNDARY_PROMPT,
  partitionDirectChatHistoryByCurrentDay,
  shouldUseCrossDayHistoryBoundary,
} from "../src/features/chat/prompts/directChatTurnPrompt";

const mainPrompt = buildDirectChatMainPrompt({ characterName: "测试角色", disableBracketActions: false });
assert.match(mainPrompt, /RED PACKET CAPABILITY/);
assert.match(mainPrompt, /unless that is your explicit character人设/);
assert.match(mainPrompt, /ordinary greeting or short message/);
assert.match(mainPrompt, /Never simulate a user reply/);
assert.match(buildDirectChatMainPrompt({ characterName: "测试角色", disableBracketActions: true }), /pure conversational speech/);

const timePrompt = buildTimeAwarenessPrompt(new Date("2026-08-11T08:30:00+08:00"), "HISTORY_MARK");
assert.match(timePrompt, /HISTORY_MARK/);
assert.match(timePrompt, /不能统一强制礼貌或亲密/);
assert.match(timePrompt, /不要强制追问行程、表达想念/);
assert.doesNotMatch(timePrompt, /绝对要表现得像过完一夜/);

assert.match(NEW_DAY_CONVERSATION_BOUNDARY_PROMPT, /dated historical reference/);
assert.match(NEW_DAY_CONVERSATION_BOUNDARY_PROMPT, /answer, explain, postpone, update, or naturally continue/);
assert.match(NEW_DAY_CONVERSATION_BOUNDARY_PROMPT, /must never be reinterpreted relative to today/);
assert.match(NEW_DAY_CONVERSATION_BOUNDARY_PROMPT, /outcome may be unknown/);
assert.match(CURRENT_SCENE_CONTINUITY_PROMPT, /Never silently replace one activity/);
assert.match(CURRENT_SCENE_CONTINUITY_PROMPT, /not automatically still pending forever/);
assert.match(CURRENT_SCENE_CONTINUITY_PROMPT, /I'm away travelling/);
assert.doesNotMatch(CURRENT_SCENE_CONTINUITY_PROMPT, /promises, and relationship facts.*still in effect/);
assert.match(timePrompt, /历史消息里的“明天／今晚／下周”/);
assert.match(timePrompt, /有关联就连贯回应新旧信息/);
const oldMessageAt = new Date("2026-07-15T22:44:00+08:00").getTime();
const currentMessageAt = new Date("2026-08-12T14:19:00+08:00").getTime();
assert.equal(shouldUseCrossDayHistoryBoundary({ enableTimeAwareness: true, currentMessageAt, latestHistoryMessageAt: oldMessageAt }), true);
assert.equal(shouldUseCrossDayHistoryBoundary({ enableTimeAwareness: false, currentMessageAt, latestHistoryMessageAt: oldMessageAt }), false);
assert.equal(shouldUseCrossDayHistoryBoundary({ enableTimeAwareness: true, currentMessageAt, latestHistoryMessageAt: currentMessageAt - 60_000 }), false);
const partitioned = partitionDirectChatHistoryByCurrentDay({
  messages: [
    { id: "old", timestamp: oldMessageAt },
    { id: "today", timestamp: currentMessageAt - 60_000 },
  ],
  currentMessageAt,
  enableTimeAwareness: true,
});
assert.deepEqual(partitioned.liveMessages.map((message) => message.id), ["today"]);
assert.deepEqual(partitioned.historicalMessages.map((message) => message.id), ["old"]);
assert.equal(partitioned.hasCrossDayHistory, true);
const historicalReference = buildCrossDayHistoricalReferencePrompt(["- 2026/8/11 23:45｜角色：你到楼下了告诉我"]);
assert.match(historicalReference, /不是当前仍在进行的现场/);
assert.match(historicalReference, /到楼下、等待、准备见面.*即时状态均已过期/);
assert.match(historicalReference, /线下经历是更晚发生的事实/);
assert.match(CURRENT_SCENE_CONTINUITY_PROMPT, /who acts, who travels, who waits/);
assert.match(buildRedPacketReactionPrompt("[红包]|6.66|开心"), /¥6\.66/);
assert.match(buildRedPacketReactionPrompt("[红包]|6.66|开心"), /开心/);
assert.match(buildStickerResponsePrompt("[表情]|笑|url"), /\[表情\]\|笑\|url/);
assert.match(buildStickerResponsePrompt("震惊小狗｜语义：瞪大眼睛｜发送格式：[表情]|震惊小狗|sticker://dog", true), /不(?:见|到)|看不见|加载失败/);

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
assert.equal((appChatSource.match(/assembledInstructions\.push\(DIRECT_CHAT_SINGLE_SPEAKER_RULE\)/g) || []).length, 2);
assert.equal((appChatSource.match(/shouldUseCrossDayHistoryBoundary\(\{/g) || []).length, 2, "send and regeneration must share cross-day history routing");
assert.equal((appChatSource.match(/partitionDirectChatHistoryByCurrentDay\(\{/g) || []).length, 2, "send and regeneration must remove old live-scene turns from current-day history");
assert.equal((appChatSource.match(/&& !isCrossDayNewSession/g) || []).length, 0, "cross-day routing must not disable relation and offline memory retrieval");
assert.equal((appChatSource.match(/buildVoiceCallPrompts\(callTopicShiftDetected\)/g) || []).length, 2);

console.log("Direct chat turn prompt parity tests passed");
