import assert from "node:assert/strict";
import { requestAutomaticMomentComment } from "../src/features/moments/services/momentCommentService";
import { requestCharacterMoment } from "../src/features/moments/services/momentGenerator";
import { requestMomentCommentReply } from "../src/features/moments/services/momentReplyService";
import type { Character } from "../src/types";
import type { apiChat } from "../src/utils/apiHelper";

const character: Character = {
  id: "character-shared",
  name: "Rin",
  avatar: "avatar.png",
  personality: "quiet and observant",
  backstory: "A test character.",
};

type ChatRequest = Parameters<typeof apiChat>[0];
const baseRequest: ChatRequest = {
  message: "existing public Moment instruction",
  history: [],
  systemInstruction: "Existing Moment prompt",
  apiKey: "",
  model: "test",
};
const capturedRequests: ChatRequest[] = [];
const captureRequest = async (request: ChatRequest) => {
  capturedRequests.push(request);
  return { text: "A safe moment reply" };
};

await requestCharacterMoment({
  requestAi: captureRequest,
  request: baseRequest,
  character,
  ownerIdentityId: "identity-a",
  relationId: "relation-a",
  parseContent: (content) => ({ content, selfComments: [] }),
  occurredAt: () => 30,
  random: () => 0.1,
});
await requestAutomaticMomentComment({
  requestAi: captureRequest,
  request: baseRequest,
  character,
  cleanText: (content) => content,
  now: () => 40,
  random: () => 0.2,
});
await requestMomentCommentReply({
  requestAi: captureRequest,
  request: baseRequest,
  character,
  userName: "User",
  cleanText: (content) => content,
  now: () => 50,
  random: () => 0.3,
});

assert.equal(capturedRequests.length, 3, "post, comment, and reply should all invoke the existing request");
for (const request of capturedRequests) {
  assert.equal(
    request,
    baseRequest,
    "Moment services must preserve the caller's public-only request without injecting private cognitive context",
  );
}

console.log("PASS Moment services preserve their public-only request boundary and legacy request compatibility");
