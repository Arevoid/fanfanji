import assert from "node:assert/strict";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { selectKnowledgeForPrivatePrompt } from "../src/domain/characterKnowledge/knowledgeVisibilityPolicy";
import { observeDirectChatMemoryAdmissionShadow } from "../src/features/chat/services/directChatMemoryAdmissionShadow";
import type { Character, Message } from "../src/types";

const character: Character = {
  id: "audit-character",
  name: "角色",
  avatar: "",
  personality: "",
  backstory: "",
};
const message: Message = {
  id: "audit-message",
  characterId: character.id,
  relationId: "audit-relation",
  conversationId: "audit-conversation",
  sender: "user",
  content: "我觉得他并不在乎我。",
  timestamp: 100,
};
const scope = {
  characterId: character.id,
  relationId: "audit-relation",
  userIdentityId: "audit-user",
  conversationId: "audit-conversation",
};

const extraction = await MemoryService.extractMemories({
  character,
  ...scope,
  recentMessages: [message],
  existingMemories: [],
  scenario: "chat",
  enableAdmissionShadowObservation: true,
  apiKey: "test-key",
  model: "test-model",
  createId: () => "audit-memory",
  currentTime: () => 100,
  formatContent: (items: readonly string[]) => items.join(";"),
}, async () => ({
  // This is the additive response shape that reproduces the Stage 4D-8
  // comparison: the legacy projection has only belief, while V2 says the
  // same candidate is subjective_reflection/non_objective.
  items: [{
    statement: "用户认为角色并不在乎用户。",
    kind: "belief",
    subject: "user",
    temporalStatus: "present",
    sourceMessageIds: [message.id],
    evidenceQuote: message.content,
  }],
  structuredCandidatesV2: [{
    schemaVersion: 2,
    kind: "subjective_reflection",
    semanticFacet: "subjective_reflection",
    epistemicStatus: "subjective",
    authorityRole: "non_objective",
    actorRole: "user",
    temporalStatus: "present",
    statement: "用户认为角色并不在乎用户。",
    sourceMessageIds: [message.id],
    evidenceQuote: message.content,
  }],
}));

assert.equal(extraction.acceptedClaims.length, 1, "legacy KnowledgeWrite gate accepts the belief candidate");
const claim = extraction.acceptedClaims[0]!;
assert.equal(claim.kind, "belief");
assert.equal(claim.truthStatus, "asserted");
assert.equal(extraction.rejectedCandidates?.some((item) => item.decision === "accepted"), true);

const projection = selectKnowledgeForPrivatePrompt([claim], scope, 100);
assert.equal(projection.confirmedFacts.length, 0, "belief is not projected as a confirmed fact");
assert.deepEqual(projection.openBeliefsAndHypotheses.map((item) => item.id), [claim.id]);

const shadow = observeDirectChatMemoryAdmissionShadow({
  extraction,
  scope,
  createCandidateId: () => "audit-candidate",
  recordedAt: 100,
});
assert.equal(shadow.candidateCount, 1);
assert.equal(shadow.observations[0]?.candidateKind, "subjective_reflection");
assert.equal(shadow.observations[0]?.legacyDecision, "accepted");
assert.equal(shadow.observations[0]?.legacyReasonCode, "accepted");
assert.equal(shadow.observations[0]?.v2State, "rejected");
assert.equal(shadow.observations[0]?.v2ReasonCode, "subjective_not_objective_truth");
assert.equal(shadow.observations[0]?.mismatch, "old_allow_new_reject");

console.log("PASS subjective legacy acceptance retains belief semantics while V2 rejects objective authority");
