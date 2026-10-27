import assert from "node:assert/strict";
import { assessKnowledgeValue } from "../src/domain/characterKnowledge/knowledgeValueAssessment";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character } from "../src/types";
const claim: KnowledgeClaim = { id: "value", characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c", statement: "这段经历改变了我的生活。请记住这件事。",
  kind: "fact", subject: "user", temporalStatus: "past", truthStatus: "asserted", confidence: .85, userConfirmed: false, recordedAt: 1, status: "active", schemaVersion: 1, visibility: "relation_private",
  source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: "m", messageIds: ["m"] } };
const value = { quote: claim.statement, impact: 3, durability: 3, novelty: 2, confidence: .95, reason: "长期改变并且用户明确要求记住", explicitRemember: true };
const scored = assessKnowledgeValue(claim, value);
assert.equal(scored.retain, true); assert.equal(scored.claim.coreCandidate, true); assert.equal(scored.claim.coreMemory, undefined);
assert.match(scored.claim.valueReason!, /来源权重/);
const unverified = assessKnowledgeValue({ ...claim, truthStatus: "legacy_unverified" }, value);
assert.equal(unverified.claim.coreCandidate, false); assert.ok(unverified.claim.importance! < scored.claim.importance!);
assert.equal(assessKnowledgeValue(claim, { ...value, quote: "未出现在原文中的判断" }).claim.coreCandidate, false);
assert.equal(assessKnowledgeValue({ ...claim, statement: "此刻窗外下了一滴雨。" }, { ...value, quote: "此刻窗外下了一滴雨。", impact: 0, durability: 0, novelty: 0, explicitRemember: false }).retain, false);
assert.equal(assessKnowledgeValue(claim, { ...value, confidence: .1 }).claim.coreCandidate, false);
const sources = ["此刻窗外下了一滴雨。", "这段经历改变了我的生活。请记住这件事。"].map((content, index) => ({ id: `source-${index}`, characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c", sender: "user" as const, content, timestamp: 100 + index }));
let sequence = 0;
const result = await MemoryService.extractMemories({ characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c", character: { id: "a", name: "林澈" } as Character,
  recentMessages: sources, existingMemories: [], scenario: "chat", apiKey: "synthetic", model: "synthetic", createId: () => `value-${sequence++}`, currentTime: () => 200,
  formatContent: (items) => items.join("\n") }, async () => ({ candidates: sources.map((source, index) => ({ statement: source.content, evidenceQuote: source.content, sourceMessageIds: [source.id], kind: "fact", subject: "user", temporalStatus: "past",
    valueAssessment: { ...value, quote: source.content, impact: index ? 3 : 0, durability: index ? 3 : 0, novelty: index ? 2 : 0, explicitRemember: Boolean(index) } })) }));
assert.equal(result.acceptedClaims.length, 1); assert.equal(result.acceptedClaims[0].coreCandidate, true);
assert.equal(sources.length, 2); assert.equal(sources[0].content, "此刻窗外下了一滴雨。", "admission filtering does not delete original messages");
console.log("PASS semantic value judgment: impact/durability/novelty/source weighting, explicit user request, ephemeral filtering, source-quote validation and reviewable candidate without auto-pinning");
