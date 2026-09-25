import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getCallTranscriptText, parseCallRecord } from "../src/features/chat/services/messageParser";
import { completeVoiceCall } from "../src/features/chat/services/voiceCallCompletion";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const completion = readFileSync(new URL("../src/features/chat/services/voiceCallCompletion.ts", import.meta.url), "utf8");

assert.equal(getCallTranscriptText("[视频画面]|我把镜头转向窗外"), "画面：我把镜头转向窗外");
assert.match(completion, /callType\?: string/);
assert.match(appChat, /callType: callMode === "video" \? "视频通话"/);

const record = completeVoiceCall({
  requestedStatus: "completed",
  transcript: [{ id: "scene", sender: "user", content: "[视频画面]|我把镜头转向窗外", timestamp: 1 }],
  durationSeconds: 12,
  id: "video-record",
  characterId: "character-1",
  scope: { relationId: "relation-1", conversationId: "conversation-1" },
  sender: "user",
  timestamp: 2,
  incoming: false,
  recentMessages: [],
  callType: "视频通话",
});
const parsed = parseCallRecord(record.callRecord.content);
assert.equal(parsed.callType, "视频通话");
assert.equal(parsed.transcript[0]?.content, "[视频画面]|我把镜头转向窗外");
console.log("PASS video-call sessions persist as typed call records with scene transcript");
