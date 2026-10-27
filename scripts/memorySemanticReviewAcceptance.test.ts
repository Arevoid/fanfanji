import { meaningfulMemoryValue } from "./fixtures/memoryValueFixture";
import assert from "node:assert/strict";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { evolveKnowledgeClaims } from "../src/domain/characterKnowledge/knowledgeEvolution";
import { acceptSemanticTransitionReview, buildSemanticTransitionReviewPrompt } from "../src/domain/characterKnowledge/semanticTransitionReview";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { Character } from "../src/types";
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const old: KnowledgeClaim = { ...scope, id: "plan", statement: "计划周六看电影", kind: "plan", subject: "relationship", truthStatus: "asserted", temporalStatus: "future",
  status: "active", confidence: .85, userConfirmed: false, recordedAt: 100, visibility: "relation_private", schemaVersion: 1,
  source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: "plan", evidenceQuote: "计划周六看电影" },
  event: { identityId: "event:plan", activity: "看电影", state: "proposed" } };
const source = "好呀，到时不见不散";
let calls = 0;
async function extract(support: boolean, fail = false) {
  return MemoryService.extractMemories({ ...scope, character: { id: "a", name: "角色" } as Character, existingClaims: [old], existingMemories: [],
    recentMessages: [{ ...scope, id: "answer", sender: "user", content: source, timestamp: 200 }], scenario: "chat",
    apiKey: "synthetic", model: "synthetic", createId: () => "answer", currentTime: () => 200, formatContent: (items) => items.join("\n") }, async (params) => {
    calls++;
    if (params.semanticReview) {
      assert.equal(params.semanticReview.length, 1); const proposal = params.semanticReview[0];
      assert.equal(proposal.currentText, source); assert.equal(proposal.previousText, old.statement);
      if (fail) throw Error("offline");
      return { semanticReviews: [{ index: proposal.index, previousId: old.id, sameEntity: true, sameAttribute: true, supported: support,
        operation: "confirmed", confidence: .98, previousQuote: old.statement, currentQuote: source, reason: "明确接受同一提议" }] };
    }
    return { candidates: [{ statement: source, evidenceQuote: source, valueAssessment: meaningfulMemoryValue(source), sourceMessageIds: ["answer"], kind: "plan", subject: "relationship", temporalStatus: "future",
      event: { activity: "看电影", state: "confirmed", referenceClaimId: old.id, referenceQuote: source, matchReason: "提取器误把当前句作为旧引用", matchConfidence: .99 } }] };
  });
}
const accepted = await extract(true); assert.equal(calls, 2);
const versions = evolveKnowledgeClaims([old], accepted.acceptedClaims);
assert.equal(versions[0].supersededById, accepted.acceptedClaims[0].id);
assert.equal(versions[1].event?.state, "confirmed"); assert.equal(versions[1].event?.identityId, "event:plan");
for (const failed of [await extract(false), await extract(true, true)]) {
  assert.equal(evolveKnowledgeClaims([old], failed.acceptedClaims)[0].supersededById, undefined);
  assert.equal(failed.acceptedClaims[0].resolutionStatus, "review");
}
const proposal = { index: 0, previousId: "cat", previousText: "橘猫叫豆豆", currentText: "原来那只橘猫叫豆豆，新来的小狗叫团团", type: "fact" as const, operation: "change", value: "团团" };
const review = { index: 0, previousId: "cat", sameEntity: false, sameAttribute: true, supported: false, operation: "change", confidence: .99,
  previousQuote: "橘猫叫豆豆", currentQuote: "新来的小狗叫团团", reason: "不同动物" };
assert.equal(acceptSemanticTransitionReview(review, proposal), undefined);
assert.equal(acceptSemanticTransitionReview({ ...review, sameEntity: true, supported: true, currentQuote: "伪造团团" }, proposal), undefined);
assert.match(buildSemanticTransitionReviewPrompt([proposal]), /新狗名字不能覆盖旧猫名字/);
assert.throws(() => buildSemanticTransitionReviewPrompt(Array.from({ length: 13 }, () => proposal)));
const naturalProposal = "我们周六一起看电影吧";
const newlyProposed = await MemoryService.extractMemories({ ...scope, character: { id: "a", name: "角色" } as Character, existingClaims: [], existingMemories: [],
  recentMessages: [{ ...scope, id: "new-proposal", sender: "user", content: naturalProposal, timestamp: 200 }], scenario: "chat",
  apiKey: "synthetic", model: "synthetic", createId: () => "new-proposal", currentTime: () => 200, formatContent: (items) => items.join("\n") }, async (params) => {
  if (params.semanticReview) return { semanticReviews: params.semanticReview.map((item) => {
    assert.ok(item.previousId.startsWith("new-event:"));
    return { index: item.index, previousId: item.previousId, sameEntity: true, sameAttribute: true, supported: true, operation: "proposed", confidence: .99,
      previousQuote: naturalProposal, currentQuote: naturalProposal, reason: "一起看电影吧明确提出共同活动，尚未接受" };
  }) };
  return { candidates: [{ statement: naturalProposal, evidenceQuote: naturalProposal, valueAssessment: meaningfulMemoryValue(naturalProposal), sourceMessageIds: ["new-proposal"], subject: "relationship", kind: "plan", temporalStatus: "future",
    event: { activity: "看电影", state: "proposed" } }] };
});
assert.equal(newlyProposed.acceptedClaims[0].event?.state, "proposed");
assert.equal(newlyProposed.acceptedClaims[0].event?.identityId, "event:claim:new-proposal:0");
console.log("PASS independent semantic review: formal extraction, natural acceptance without cue words, grounded scoped event identity, refusal/timeout hold, quoted evidence and bounded batches; model judgments synthetic");
