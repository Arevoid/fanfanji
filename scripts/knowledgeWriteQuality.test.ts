import assert from "node:assert/strict";
import { evaluateKnowledgeWrite } from "../src/domain/characterKnowledge/knowledgeWritePolicy";

const makeCandidate = (statement: string) => ({
  id: `claim:test:${statement}`,
  relationId: "relation-test",
  characterId: "character-test",
  userIdentityId: "identity-test",
  conversationId: "conversation-test",
  kind: "fact" as const,
  subject: "user" as const,
  statement,
  temporalStatus: "present" as const,
  source: {
    kind: "user_message" as const,
    authorship: "user" as const,
    app: "chat" as const,
    messageIds: ["message-test"],
    producer: "quality-test",
    evidenceKey: `evidence:${statement}`,
  },
  recordedAt: 1,
});

assert.deepEqual(evaluateKnowledgeWrite(makeCandidate("好啊")), { accepted: false, reason: "low_information" });
assert.deepEqual(evaluateKnowledgeWrite(makeCandidate("你等我")), { accepted: false, reason: "low_information" });
assert.deepEqual(evaluateKnowledgeWrite(makeCandidate("来填空吧")), { accepted: false, reason: "low_information" });
assert.equal(evaluateKnowledgeWrite(makeCandidate("我喜欢猫")).accepted, true);
assert.equal(evaluateKnowledgeWrite(makeCandidate("好，我明天八点到")).accepted, true);
console.log("PASS low-information knowledge candidates are rejected without blocking durable statements");
