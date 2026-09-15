import { strict as assert } from "node:assert";
import type { Message } from "../src/types";
import { createAcceptedRelationshipPlanClaim } from "../src/features/characterKnowledge/services/relationshipCommitmentCapture";

const scope = { relationId: "relation-plan", characterId: "character-plan", userIdentityId: "identity-plan", conversationId: "direct:relation-plan" };
const message = (id: string, sender: "user" | "character", content: string): Message => ({
  id,
  characterId: scope.characterId,
  relationId: scope.relationId,
  conversationId: scope.conversationId,
  sender,
  content,
  timestamp: Number(id.replace(/\D/gu, "")) || 1,
});

const accepted = createAcceptedRelationshipPlanClaim({
  userMessage: message("user-1", "user", "这样吧，每天给我一个亲亲，连续10天完成打卡"),
  characterMessages: [message("character-2", "character", "好，没问题，说定了")],
  characterName: "谌澈",
  scope,
  now: 20,
});
assert.equal(accepted?.kind, "plan");
assert.equal(accepted?.truthStatus, "asserted");
assert.equal(accepted?.temporalStatus, "future");
assert.deepEqual(accepted?.source.messageIds, ["user-1", "character-2"]);

assert.equal(createAcceptedRelationshipPlanClaim({
  userMessage: message("user-3", "user", "要不要每天打卡？"),
  characterMessages: [message("character-4", "character", "可以吗？")],
  scope,
}), undefined, "questions and tentative proposals must not become plans");

assert.equal(createAcceptedRelationshipPlanClaim({
  userMessage: message("user-5", "user", "我明天要辞职"),
  characterMessages: [message("character-6", "character", "我会陪着你")],
  scope,
}), undefined, "warmth without explicit acceptance must not become an agreement");

console.log("PASS immediate relationship plan capture and conservative acceptance checks");
