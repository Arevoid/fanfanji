import { meaningfulMemoryValue } from "./fixtures/memoryValueFixture";
import assert from "node:assert/strict";
import type { KnowledgeClaim, SemanticFactDecision } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { evolveKnowledgeClaims } from "../src/domain/characterKnowledge/knowledgeEvolution";
import { normalizeKnowledgeClaim } from "../src/domain/characterKnowledge/knowledgeWritePolicy";
import { semanticFactRegistry } from "../src/domain/characterKnowledge/semanticFactResolution";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character } from "../src/types";
import { authorizeSemanticTransition } from "../src/domain/characterKnowledge/semanticTransitionReview";
import { appendToKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const claim = (id: string, statement: string, recordedAt = 100): KnowledgeClaim => ({ ...scope, id, statement, subject: "user", kind: "fact", temporalStatus: "present",
  truthStatus: "asserted", source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: id, messageIds: [id], evidenceQuote: statement, statementAt: recordedAt },
  confidence: .85, userConfirmed: false, recordedAt, status: "active", visibility: "relation_private", schemaVersion: 1 });
const old = claim("cat", "我家那只橘猫一直叫豆豆。");
const changed = claim("renamed", "那个小家伙往后唤团团，豆豆这个称呼不用了。", 200);
const decision: SemanticFactDecision = { targetClaimId: old.id, entity: "用户的橘猫", attribute: "称呼", value: "团团", operation: "change", confidence: .97,
  reason: "同一只橘猫的新称呼替换旧称呼，原文明确停用旧称呼", previousQuote: old.statement, currentQuote: changed.statement };
changed.factDecision = decision;
authorizeSemanticTransition(changed, old); // Synthetic successful independent-review result, not a real model proof.
const records = evolveKnowledgeClaims([old], [changed]);
assert.equal(records[0].supersededById, changed.id); assert.equal(records[1].supersedesId, old.id);
assert.equal(records[0].factIdentity?.attributeId, records[1].factIdentity?.attributeId);
assert.equal(normalizeKnowledgeClaim(JSON.parse(JSON.stringify(records[1])))?.factIdentity?.entityId, records[1].factIdentity?.entityId);
const updated = records[1];
const repeat = { ...claim("repeat", "我家的橘猫叫团团。", 300), factDecision: { ...decision, targetClaimId: updated.id,
  previousQuote: updated.statement, currentQuote: "我家的橘猫叫团团。", operation: "duplicate" as const } };
authorizeSemanticTransition(repeat, updated);
const dedup = evolveKnowledgeClaims(records, [repeat]); assert.equal(dedup.length, 2); assert.ok(dedup[1].mergedClaimIds?.includes(repeat.id));
for (const broken of [{ ...decision, targetClaimId: "foreign" }, { ...decision, previousQuote: "不存在的来源" }, { ...decision, confidence: .2 }]) {
  const result = evolveKnowledgeClaims([old], [{ ...changed, factDecision: broken }]);
  assert.equal(result[0].supersededById, undefined); assert.equal(result[1].resolutionStatus, "review"); assert.equal(result[1].truthStatus, "disputed");
}
const conditionOld = { ...old, semantics: { key: "coffee:when:熬夜时", value: "咖啡", condition: "熬夜时", update: "assertion" as const } };
assert.equal(evolveKnowledgeClaims([conditionOld], [changed])[0].supersededById, undefined);
const lateClaim = { ...old, id: "late", recordedAt: 400, factDecision: { ...decision, targetClaimId: updated.id,
  value: "豆豆", previousQuote: updated.statement, currentQuote: old.statement } };
authorizeSemanticTransition(lateClaim, updated);
const late = evolveKnowledgeClaims([updated], [lateClaim]);
assert.equal(late[0].supersededById, undefined); assert.equal(late[1].supersededById, updated.id);
assert.equal(semanticFactRegistry([old, { ...old, id: "foreign", relationId: "other" }], scope, "猫").length, 1);
for (const subject of ["other", "relationship"] as const) {
  const before = { ...old, subject }; const after = { ...changed, subject }; authorizeSemanticTransition(after, before);
  const versions = evolveKnowledgeClaims([before], [after]);
  assert.equal(versions[0].supersededById, changed.id, "source-bound semantic identity is not limited to first-person preference words");
}
assert.equal(evolveKnowledgeClaims([{ ...old, subject: "character" }], [{ ...changed, subject: "character", truthStatus: "inferred", source: { ...changed.source, authorship: "character" } }])[0].supersededById, undefined,
  "generated character dialogue cannot authorize a factual revision");
let requestChecked = false;
const extracted = await MemoryService.extractMemories({ ...scope, character: { id: "a", name: "角色", personality: "温和" } as Character,
  recentMessages: [{ ...scope, id: "m", sender: "user", content: changed.statement, timestamp: 200 }], existingClaims: [old], existingMemories: [],
  scenario: "chat", apiKey: "synthetic", model: "synthetic", createId: () => "new", currentTime: () => 200, formatContent: (items) => items.join("\n") }, async (params) => {
  requestChecked = params.semanticRegistry?.[0].id === old.id;
  if (params.semanticReview) return { semanticReviews: params.semanticReview.map((proposal) => ({ index: proposal.index, previousId: proposal.previousId,
    sameEntity: true, sameAttribute: true, supported: true, operation: proposal.operation, confidence: .98,
    previousQuote: proposal.previousText, currentQuote: proposal.currentText, reason: "独立比较确认同一只猫的称呼变化" })) };
  return { candidates: [{ statement: changed.statement, evidenceQuote: changed.statement, valueAssessment: meaningfulMemoryValue(changed.statement), sourceMessageIds: ["m"], subject: "user", kind: "fact", temporalStatus: "present", factDecision: decision }] };
});
assert.ok(requestChecked); assert.equal(evolveKnowledgeClaims([old], extracted.acceptedClaims)[0].supersededById, extracted.acceptedClaims[0].id);
assert.equal(appendToKnowledgeClaims([old], extracted.acceptedClaims)[0].supersededById, extracted.acceptedClaims[0].id,
  "the formal repository normalization must preserve a runtime authorization without trusting persisted flags");
assert.equal(appendToKnowledgeClaims([old], JSON.parse(JSON.stringify(extracted.acceptedClaims)))[0].supersededById, undefined,
  "a backup/model JSON cannot manufacture the runtime authorization");
const originalCat = claim("original-cat", "我只养了一只橘猫，它的名字是豆豆。");
const mixedSource = "我新养了一只小狗，它叫团团；原来那只橘猫仍叫豆豆。";
const unsafeProposal = await MemoryService.extractMemories({ ...scope, character: { id: "a", name: "林澈" } as Character,
  recentMessages: [{ ...scope, id: "mixed", sender: "user", content: mixedSource, timestamp: 200 }], existingClaims: [originalCat], existingMemories: [],
  scenario: "chat", apiKey: "synthetic", model: "synthetic", createId: () => "bad-proposal", currentTime: () => 200, formatContent: (items) => items.join("\n") }, async () => ({ candidates: [{
    statement: "用户的小狗叫团团", evidenceQuote: "我新养了一只小狗，它叫团团", valueAssessment: meaningfulMemoryValue("我新养了一只小狗，它叫团团"), sourceMessageIds: ["mixed"], kind: "fact", subject: "user", temporalStatus: "present",
    factDecision: { ...decision, targetClaimId: originalCat.id, previousQuote: originalCat.statement, currentQuote: "我新养了一只小狗，它叫团团", entity: "宠物" },
  }] }));
const guarded = evolveKnowledgeClaims([originalCat], unsafeProposal.acceptedClaims);
assert.equal(guarded[0].supersededById, undefined, "even a confident bad model proposal cannot override an explicitly unchanged target in the same source");
assert.equal(guarded[1].resolutionStatus, "review");
const dog = { ...claim("dog", "新来的小狗叫团团", 200), factDecision: { ...decision, targetClaimId: originalCat.id,
  previousQuote: originalCat.statement, currentQuote: "新来的小狗叫团团", entity: "宠物" } };
assert.equal(evolveKnowledgeClaims([originalCat], [dog])[0].supersededById, undefined,
  "a confident model-only decision cannot overwrite another animal even without unchanged cue words");
const tampered = { ...changed }; // A serialized/copied claim must not carry ephemeral authority.
assert.equal(evolveKnowledgeClaims([old], [tampered])[0].supersededById, undefined);
console.log("PASS semantic identity: paraphrase without alias rule, runtime entity/attribute IDs, formal extraction registry, duplicate lineage, conditions, late history, persisted identity and unsafe-decision review; semantic decision mocked");
