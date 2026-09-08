import assert from "node:assert/strict";
import { requestAutomaticMomentComment } from "../src/features/moments/services/momentCommentService";
import { requestCharacterMoment } from "../src/features/moments/services/momentGenerator";
import { requestMomentCommentReply } from "../src/features/moments/services/momentReplyService";
import type { Character } from "../src/types";
import type { apiChat } from "../src/utils/apiHelper";

const character: Character = {
  id: "character-1",
  name: "阿岚",
  avatar: "avatar.png",
  personality: "克制而温和",
  backstory: "测试角色",
};
type ChatRequest = Parameters<typeof apiChat>[0];
const request: ChatRequest = { message: "m", history: [], systemInstruction: "s", apiKey: "", model: "test" };
const captured: ChatRequest[] = [];
const requestAi = async (nextRequest: ChatRequest) => {
  captured.push(nextRequest);
  return { text: "一条原有流程可接受的动态" };
};

const post = await requestCharacterMoment({
  requestAi,
  request,
  character,
  ownerIdentityId: "identity-a",
  relationId: "relation-a",
  parseContent: (content) => ({ content, selfComments: [] }),
  occurredAt: () => 30,
  random: () => 0.1,
});
assert.equal(post.moment?.content, "一条原有流程可接受的动态");
assert.equal(post.moment?.relationId, "relation-a");

const comment = await requestAutomaticMomentComment({
  requestAi,
  request,
  character,
  cleanText: (content) => content,
  now: () => 40,
  random: () => 0.2,
});
assert.equal(comment?.content, "一条原有流程可接受的动态");

const reply = await requestMomentCommentReply({
  requestAi,
  request,
  character,
  userName: "机主",
  cleanText: (content) => content,
  now: () => 50,
  random: () => 0.3,
});
assert.equal(reply?.content, "回复机主：一条原有流程可接受的动态");
assert.equal(captured.length, 3);
assert.ok(captured.every((capturedRequest) => capturedRequest === request));

console.log("PASS Moment generation keeps the legacy public request path without private cognitive context");
