import assert from "node:assert/strict";
import { createVoiceCallUserMessage } from "../src/features/chat/services/voiceCallMessage";

const scope = { relationId: "relation-1", conversationId: "direct:relation-1" };
const message = createVoiceCallUserMessage({
  text: "  电话里的字幕  ",
  characterId: "character-1",
  sessionRelationId: "relation-1",
  scope,
  id: "call-message-1",
  timestamp: 123,
});
assert.deepEqual(message, {
  id: "call-message-1",
  characterId: "character-1",
  relationId: "relation-1",
  conversationId: "direct:relation-1",
  sender: "user",
  content: "电话里的字幕",
  timestamp: 123,
});
assert.equal(createVoiceCallUserMessage({ text: "   ", characterId: "character-1", sessionRelationId: "relation-1", scope, id: "empty", timestamp: 1 }), undefined);
assert.equal(createVoiceCallUserMessage({ text: "串会话", characterId: "character-1", sessionRelationId: "relation-2", scope, id: "stale", timestamp: 1 }), undefined);
assert.equal(createVoiceCallUserMessage({ text: "缺少角色", sessionRelationId: "relation-1", scope, id: "missing", timestamp: 1 }), undefined);
console.log("PASS voice call user message creation trims subtitles and rejects stale or empty call scopes");
