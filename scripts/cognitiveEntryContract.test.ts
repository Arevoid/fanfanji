import assert from "node:assert/strict";
import { buildInnerVoicePrompt } from "../src/domain/prompt/innerVoicePrompt";
import { buildMomentPublicCognitiveContext } from "../src/domain/momentCognitive/momentPublicContextBuilder";
import { requestAutomaticMomentComment } from "../src/features/moments/services/momentCommentService";
import { requestCharacterMoment } from "../src/features/moments/services/momentGenerator";
import { requestMomentCommentReply } from "../src/features/moments/services/momentReplyService";
import type { Character } from "../src/types";
import type { apiChat } from "../src/utils/apiHelper";

const character: Character = {
  id: "contract-character",
  name: "Contract Character",
  avatar: "avatar.png",
  personality: "quiet",
  backstory: "public background",
};

type ChatRequest = Parameters<typeof apiChat>[0];
const baseRequest: ChatRequest = {
  message: "public task",
  history: [],
  systemInstruction: "existing public prompt",
  apiKey: "",
  model: "test",
};
const publicContext = buildMomentPublicCognitiveContext({
  character,
  publicMomentHistory: [
    { characterId: character.id, visibility: "public", authorName: character.name, content: "public history", timestamp: 1 },
  ],
  currentTime: { now: 2, date: "2026-08-01", time: "20:00" },
});
const requests: ChatRequest[] = [];
const requestAi = async (request: ChatRequest) => {
  requests.push(request);
  return { text: "safe generated content" };
};

await requestCharacterMoment({
  requestAi,
  request: baseRequest,
  character,
  ownerIdentityId: "identity-private",
  relationId: "relation-private",
  publicContext,
  parseContent: (content) => ({ content, selfComments: [] }),
  occurredAt: () => 3,
  random: () => 0.1,
});
await requestAutomaticMomentComment({
  requestAi,
  request: baseRequest,
  character,
  publicContext,
  cleanText: (content) => content,
  now: () => 4,
  random: () => 0.2,
});
await requestMomentCommentReply({
  requestAi,
  request: baseRequest,
  character,
  publicContext,
  userName: "public user",
  cleanText: (content) => content,
  now: () => 5,
  random: () => 0.3,
});

assert.equal(requests.length, 3);
for (const request of requests) {
  assert.match(request.systemInstruction || "", /PUBLIC-SAFE MOMENT COGNITIVE CONTEXT/);
  assert.match(request.systemInstruction || "", /public history/);
  for (const forbidden of ["contract-character", "relation-private", "identity-private", "InnerVoice"]) {
    assert.equal((request.systemInstruction || "").includes(forbidden), false, `${forbidden} must not enter a public Moment prompt`);
  }
}

const innerVoicePrompt = buildInnerVoicePrompt({
  character,
  relationship: {
    id: "relation-private",
    characterId: character.id,
    userIdentityId: "identity-private",
    conversationId: "direct:relation-private",
    relationship: "friend",
    createdAt: 1,
    updatedAt: 1,
  },
  relationId: "relation-private",
  triggerMessage: { id: "message-1", characterId: character.id, sender: "user", content: "hello", timestamp: 1 },
  recentMessages: [],
  userName: "public user",
});
assert.equal(innerVoicePrompt.includes("relation-private"), false, "InnerVoice prompt must not expose relation IDs");
assert.equal(innerVoicePrompt.includes("identity-private"), false, "InnerVoice prompt must not expose identity IDs");

console.log("PASS cognitive entry contract: Moment uses public adapter, and InnerVoice stays scoped without internal IDs");
