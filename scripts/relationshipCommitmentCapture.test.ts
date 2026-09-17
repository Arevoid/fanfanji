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

const explicitRule = createAcceptedRelationshipPlanClaim({
  userMessage: message("user-2", "user", "打卡格式是亲亲老婆，么么哒"),
  characterMessages: [message("character-3", "character", "好，我知道了")],
  scope,
});
assert.equal(explicitRule?.kind, "plan", "an explicit check-in format is durable relationship guidance");

assert.equal(createAcceptedRelationshipPlanClaim({
  userMessage: message("user-3", "user", "要不要每天打卡？"),
  characterMessages: [message("character-4", "character", "可以吗？")],
  scope,
}), undefined, "questions and tentative proposals must not become plans");

assert.equal(createAcceptedRelationshipPlanClaim({
  userMessage: message("user-7", "user", "打卡格式是什么"),
  characterMessages: [message("character-8", "character", "我来想想")],
  scope,
}), undefined, "questions about a rule must not become plans");

const naturalAcceptance = createAcceptedRelationshipPlanClaim({
  userMessage: message("user-9", "user", "按这个格式连续打卡10天"),
  characterMessages: [message("character-10", "character", "这样才行，才算完成")],
  scope,
});
assert.equal(naturalAcceptance?.kind, "plan", "natural acceptance wording should capture the plan");

assert.equal(createAcceptedRelationshipPlanClaim({
  userMessage: message("user-5", "user", "我明天要辞职"),
  characterMessages: [message("character-6", "character", "我会陪着你")],
  scope,
}), undefined, "warmth without explicit acceptance must not become an agreement");

console.log("PASS immediate relationship plan capture and conservative acceptance checks");
