import assert from "node:assert/strict";
import { evaluateKnowledgeWrite } from "../src/domain/characterKnowledge/knowledgeWritePolicy";
import { selectKnowledgeForPrivatePrompt } from "../src/domain/characterKnowledge/knowledgeVisibilityPolicy";
import type { KnowledgeWriteCandidate } from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const candidate = (overrides: Partial<KnowledgeWriteCandidate> = {}): KnowledgeWriteCandidate => ({
  id: "claim-1",
  relationId: "relation-a",
  characterId: "character-shared",
  userIdentityId: "identity-a",
  conversationId: "direct:relation-a",
  kind: "fact",
  subject: "user",
  statement: "I live in Shanghai.",
  temporalStatus: "present",
  source: {
    kind: "user_message",
    authorship: "user",
    messageIds: ["message-1"],
    producer: "test",
    evidenceKey: "message-1:user-home",
  },
  recordedAt: 100,
  ...overrides,
});

const assertion = evaluateKnowledgeWrite(candidate());
assert.equal(assertion.accepted, true);
if (!assertion.accepted) throw new Error("expected asserted user claim");
assert.equal(assertion.claim.truthStatus, "asserted");
assert.equal(assertion.claim.userConfirmed, false);

const futurePlan = evaluateKnowledgeWrite(candidate({
  id: "plan-1",
  statement: "以后我们计划一起去日本。",
  temporalStatus: "past",
}));
assert.equal(futurePlan.accepted, true);
if (!futurePlan.accepted) throw new Error("expected future plan");
assert.equal(futurePlan.claim.kind, "plan");
assert.equal(futurePlan.claim.temporalStatus, "future");
assert.notEqual(futurePlan.claim.kind, "fact");

const hypothesis = evaluateKnowledgeWrite(candidate({
  id: "hypothesis-1",
  statement: "如果我们住在一起，也许会养一只猫。",
  temporalStatus: "past",
}));
assert.equal(hypothesis.accepted, true);
if (!hypothesis.accepted) throw new Error("expected hypothesis");
assert.equal(hypothesis.claim.kind, "hypothesis");
assert.equal(hypothesis.claim.temporalStatus, "unknown");
assert.notEqual(hypothesis.claim.kind, "fact");

assert.deepEqual(evaluateKnowledgeWrite(candidate({ id: "question", statement: "你住在上海吗？" })), {
  accepted: false,
  reason: "question_or_instruction",
});
assert.equal(evaluateKnowledgeWrite(candidate({ id: "roleplay", statement: "（走过去抱住你）" })).accepted, false);
assert.equal(evaluateKnowledgeWrite(candidate({ id: "missing-scope", relationId: "" })).accepted, false);
assert.equal(evaluateKnowledgeWrite(candidate({
  id: "missing-evidence",
  source: { kind: "user_message", authorship: "user", producer: "test", evidenceKey: "missing" },
})).accepted, false);
assert.deepEqual(evaluateKnowledgeWrite(candidate({
  id: "ooc",
  source: {
    kind: "ooc_correction",
    authorship: "user",
    messageIds: ["ooc-message"],
    producer: "ooc.v1",
    evidenceKey: "ooc-message",
  },
})), { accepted: false, reason: "behavior_correction_required" });

const aiStatement = evaluateKnowledgeWrite(candidate({
  id: "ai-claim",
  requestedTruthStatus: "confirmed",
  source: {
    kind: "user_message",
    authorship: "character",
    messageIds: ["ai-message"],
    producer: "test",
    evidenceKey: "ai-message:invented",
  },
  statement: "We met in a cafe last year.",
  temporalStatus: "past",
}));
assert.equal(aiStatement.accepted, true);
if (!aiStatement.accepted) throw new Error("expected downgraded AI claim");
assert.equal(aiStatement.claim.truthStatus, "inferred");
assert.notEqual(aiStatement.claim.truthStatus, "confirmed");
assert.equal(aiStatement.claim.confidence <= 0.5, true);

const deterministic = evaluateKnowledgeWrite(candidate({
  id: "call-event",
  source: {
    kind: "deterministic_action",
    authorship: "system",
    eventId: "event-call",
    producer: "voice-call.capture.v1",
    evidenceKey: "event-call",
  },
  statement: "A voice call was completed.",
  subject: "relationship",
  temporalStatus: "past",
}));
assert.equal(deterministic.accepted, true);
if (!deterministic.accepted) throw new Error("expected deterministic action");
assert.equal(deterministic.claim.truthStatus, "confirmed");

const fictionalStory = evaluateKnowledgeWrite(candidate({
  id: "story-claim",
  source: {
    kind: "offline_story",
    authorship: "user",
    storyId: "story-if",
    producer: "offline.extractor.v1",
    evidenceKey: "story-if:claim",
  },
}));
assert.deepEqual(fictionalStory, { accepted: false, reason: "fictional_story_boundary" });

const confirmedStory = evaluateKnowledgeWrite(candidate({
  id: "confirmed-story-claim",
  userConfirmed: true,
  source: {
    kind: "offline_story",
    authorship: "user",
    storyId: "story-continue",
    producer: "offline.extractor.v1",
    evidenceKey: "story-continue:claim",
  },
  offlineStoryPolicyInput: {
    story: {
      id: "story-continue",
      characterId: "character-shared",
      relationId: "relation-a",
      conversationId: "direct:relation-a",
      title: "Confirmed continuation",
      createdAt: 1,
      updatedAt: 2,
      mode: "continue",
      messages: [],
    },
    userConfirmed: true,
    sourceMessages: [{
      id: "story-user-message",
      characterId: "character-shared",
      relationId: "relation-a",
      conversationId: "direct:relation-a",
      sender: "user",
      content: "This really happened.",
      timestamp: 2,
    }],
  },
}));
assert.equal(confirmedStory.accepted, true, "only a user-confirmed direct continuation may leave the story domain");

const projection = selectKnowledgeForPrivatePrompt(
  [assertion.claim, futurePlan.claim, hypothesis.claim, aiStatement.claim, deterministic.claim],
  assertion.claim,
  100,
);
assert.deepEqual(projection.confirmedFacts.map((item) => item.id), ["call-event"]);
assert.deepEqual(projection.futurePlans.map((item) => item.id), ["plan-1"]);
assert.deepEqual(projection.openBeliefsAndHypotheses.map((item) => item.id), ["hypothesis-1", "ai-claim"]);
assert.equal(projection.userAssertions.some((item) => item.id === "claim-1"), true);
const thirtyDaysLater = selectKnowledgeForPrivatePrompt([futurePlan.claim], futurePlan.claim, 100 + 30 * 24 * 60 * 60 * 1000);
assert.equal(thirtyDaysLater.futurePlans[0]?.temporalStatus, "future", "time passing never turns a plan into a past fact");

console.log("PASS Character Truth write, temporal, trust, story, and prompt visibility policies");
