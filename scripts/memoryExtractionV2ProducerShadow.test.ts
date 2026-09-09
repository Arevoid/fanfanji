import assert from "node:assert/strict";
import {
  buildKnowledgeExtractionPrompt,
  parseKnowledgeExtractionOutputWithV2,
  parseOrRepairKnowledgeExtractionOutput,
} from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import { apiExtractMemoriesWithModelFallback } from "../src/utils/apiHelper";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character, Message } from "../src/types";
import type { MemoryExtractionResult } from "../src/domain/memory/memoryTypes";
import { adaptDirectChatMemoryExtractionToCandidates } from "../src/features/chat/services/directChatMemoryCandidateAdapter";
import { observeDirectChatMemoryAdmissionShadow } from "../src/features/chat/services/directChatMemoryAdmissionShadow";

const character: Character = { id: "producer-character", name: "角色", avatar: "", personality: "", backstory: "" };
const sourceMessage: Message = {
  id: "producer-message",
  characterId: character.id,
  relationId: "producer-relation",
  conversationId: "direct:producer",
  sender: "user",
  content: "我周末喜欢喝咖啡，去年我们一起去了海边。",
  timestamp: 10,
};
const allowedMessageIds = new Set([sourceMessage.id]);

const base = (overrides: Record<string, unknown> = {}) => ({
  statement: "用户喜欢周末喝咖啡。",
  kind: "fact",
  subject: "user",
  temporalStatus: "present",
  sourceMessageIds: [sourceMessage.id],
  evidenceQuote: "我周末喜欢喝咖啡",
  ...overrides,
});
const v2 = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  kind: "fact",
  semanticFacet: "preference",
  durability: "stable",
  actorRole: "user",
  targetRole: "character",
  ...overrides,
});

const response = [
  base({ v2: v2() }),
  base({ kind: "preference", v2: v2({ kind: "fact", durability: "temporary" }), statement: "用户此刻想喝咖啡。" }),
  base({ kind: "hypothesis", v2: v2({ kind: "belief", semanticFacet: "hypothesis" }), statement: "角色认为用户可能会来。" }),
  base({ kind: undefined, subject: undefined, v2: v2({ kind: "event", semanticFacet: undefined, durability: undefined }), statement: "双方去年一起去了海边。", temporalStatus: "past" }),
  base({ kind: undefined, subject: undefined, v2: v2({ kind: "episodic", semanticFacet: undefined, durability: undefined }), statement: "那次海边旅行是值得记住的共同经历。", temporalStatus: "past" }),
  base({ kind: undefined, subject: undefined, v2: v2({ kind: "relationship_signal", semanticFacet: "relationship_signal", relationshipSignalKind: "promise" }), statement: "双方作出了共同承诺。" }),
  base({ kind: undefined, subject: undefined, v2: v2({ kind: "scene_only", semanticFacet: "scene_only", durability: "temporary" }), statement: "双方此刻在客厅。" }),
  base({ kind: undefined, subject: undefined, v2: v2({ kind: "subjective_reflection", semanticFacet: "subjective_reflection" }), statement: "角色对这段关系有复杂感受。" }),
  base({ kind: undefined, subject: undefined, v2: v2({ kind: "unknown", semanticFacet: undefined }), statement: "无法确定语义的候选。" }),
  base({ v2: v2({ kind: "event", semanticFacet: undefined, durability: undefined, sourceMessageIds: ["spoofed-id"], characterId: "spoofed-character", authoritative: true }), statement: "外层来源仍由 runtime 校验。", temporalStatus: "unknown" }),
].map((item) => JSON.stringify(item)).join("\n");

const parsed = parseKnowledgeExtractionOutputWithV2(response, allowedMessageIds);
assert.equal(parsed.candidates.length, 4, "only legacy-compatible projections enter acceptedClaims parsing");
assert.equal(parsed.structuredCandidatesV2.length, 10, "one response yields additive V2 metadata without duplicate bodies");
assert.equal(parsed.v2MetadataPresent, true);
assert.equal(parsed.structuredCandidatesV2[0]?.semanticFacet, "preference");
assert.equal(parsed.structuredCandidatesV2[1]?.durability, "temporary");
assert.equal(parsed.structuredCandidatesV2[2]?.kind, "belief");
assert.equal(parsed.structuredCandidatesV2[3]?.kind, "event");
assert.equal(parsed.structuredCandidatesV2[4]?.kind, "episodic");
assert.equal(parsed.structuredCandidatesV2[5]?.relationshipSignalKind, "promise");
assert.equal(parsed.structuredCandidatesV2[6]?.kind, "scene_only");
assert.equal(parsed.structuredCandidatesV2[7]?.kind, "subjective_reflection");
assert.equal(parsed.structuredCandidatesV2[8]?.kind, "unknown");
assert.deepEqual(parsed.structuredCandidatesV2[9]?.sourceMessageIds, [sourceMessage.id], "nested spoofed source refs are ignored");
assert.equal("characterId" in (parsed.structuredCandidatesV2[9] || {}), false, "canonical IDs are not accepted from AI metadata");
assert.equal("authoritative" in (parsed.structuredCandidatesV2[9] || {}), false, "authority fields are ignored");

const partial = parseKnowledgeExtractionOutputWithV2(JSON.stringify(base({ v2: { schemaVersion: 2, kind: "event" } })), allowedMessageIds);
assert.equal(partial.candidates.length, 1);
assert.equal(partial.structuredCandidatesV2.length, 1, "optional V2 fields may be absent safely");
assert.equal(partial.structuredCandidatesV2[0]?.kind, "event");
const malformedOptional = parseKnowledgeExtractionOutputWithV2(JSON.stringify(base({
  v2: { schemaVersion: 2, kind: "event", actorRole: 42, confidence: "not-a-number", importance: 99 },
})), allowedMessageIds);
assert.equal(malformedOptional.candidates.length, 1);
assert.equal(malformedOptional.structuredCandidatesV2.length, 1, "bad optional metadata does not invalidate legacy output");
assert.equal(malformedOptional.structuredCandidatesV2[0]?.actorRole, undefined);
assert.equal(malformedOptional.structuredCandidatesV2[0]?.confidence, undefined);

let malformedV2RepairCalls = 0;
const malformedV2 = await parseOrRepairKnowledgeExtractionOutput({
  rawText: JSON.stringify(base({ v2: { schemaVersion: 2, kind: "not-a-kind" } })),
  allowedMessageIds,
  originalPrompt: "producer prompt",
  repair: async () => {
    malformedV2RepairCalls += 1;
    return "";
  },
});
assert.equal(malformedV2RepairCalls, 0, "malformed optional V2 does not trigger repair when legacy is valid");
assert.equal(malformedV2.candidates.length, 1);
assert.equal(malformedV2.structuredCandidatesV2.length, 0);
assert.equal(malformedV2.v2MetadataPresent, true);

let v2OnlyRepairCalls = 0;
const v2Only = await parseOrRepairKnowledgeExtractionOutput({
  rawText: JSON.stringify(base({ kind: undefined, subject: undefined, v2: v2({ kind: "event", semanticFacet: undefined, durability: undefined }) })),
  allowedMessageIds,
  originalPrompt: "producer prompt",
  repair: async () => {
    v2OnlyRepairCalls += 1;
    return "";
  },
});
assert.equal(v2OnlyRepairCalls, 0, "valid V2-only candidates do not spend a repair request");
assert.equal(v2Only.structuredCandidatesV2.length, 1);

let plainRepairCalls = 0;
await parseOrRepairKnowledgeExtractionOutput({
  rawText: "普通文字，不是结构化候选",
  allowedMessageIds,
  originalPrompt: "producer prompt",
  repair: async () => {
    plainRepairCalls += 1;
    return "";
  },
});
assert.equal(plainRepairCalls, 1, "legacy malformed output retains the existing repair behavior");

const promptInput = {
  characterName: character.name,
  history: [{ id: sourceMessage.id, role: "user" as const, text: sourceMessage.content }],
};
const legacyPrompt = buildKnowledgeExtractionPrompt(promptInput);
const v2Prompt = buildKnowledgeExtractionPrompt({ ...promptInput, includeV2Shadow: true });
const offlinePrompt = buildKnowledgeExtractionPrompt({ ...promptInput, includeV2Shadow: true, scenario: "offline" });
const promptOverhead = v2Prompt.length - legacyPrompt.length;
assert.ok(promptOverhead > 0 && promptOverhead < 3000, `V2 instruction overhead should remain bounded: ${promptOverhead}`);
assert.match(v2Prompt, /Memory V2 shadow/);
assert.match(v2Prompt, /relationship_signal/);
assert.doesNotMatch(offlinePrompt, /Memory V2 shadow/, "normal Direct Chat producer flag does not leak to Offline");
console.log(`V2 producer prompt overhead: ${promptOverhead} characters (approximately ${Math.ceil(promptOverhead / 4)} tokens)`);

const extraction: MemoryExtractionResult = {
  extractedMemories: [],
  acceptedClaims: parsed.candidates.map((candidate, index) => ({
    id: `legacy-claim-${index}`,
    characterId: character.id,
    relationId: "producer-relation",
    userIdentityId: "producer-user",
    conversationId: "direct:producer",
    kind: candidate.kind,
    subject: candidate.subject,
    statement: candidate.statement,
    truthStatus: "inferred",
    temporalStatus: candidate.temporalStatus,
    source: { kind: "user_message", authorship: "unknown", messageIds: candidate.sourceMessageIds, producer: "memory-extractor.chat.v1", evidenceKey: `producer:${index}` },
    confidence: 0.4,
    userConfirmed: false,
    recordedAt: 100,
    status: "active",
    visibility: "relation_private",
    schemaVersion: 1,
  })),
  rejectedCandidateCount: 0,
  structuredCandidatesV2: parsed.structuredCandidatesV2,
};
const adapterInput = {
  extraction,
  scope: { characterId: character.id, relationId: "producer-relation", userIdentityId: "producer-user", conversationId: "direct:producer" },
  recordedAt: 100,
  createCandidateId: (() => {
    let index = 0;
    return () => `producer-candidate-${++index}`;
  })(),
};
const adapted = adaptDirectChatMemoryExtractionToCandidates(adapterInput);
const shadow = observeDirectChatMemoryAdmissionShadow(adapterInput);
assert.equal(adapted.candidates.length, 10);
assert.equal(shadow.candidateCount, 10);
assert.equal(shadow.acceptedByTarget.truth, 1, "stable preference remains a Truth candidate only in shadow");
assert.equal(shadow.acceptedByTarget.belief, 1);
assert.equal(shadow.acceptedByTarget.event, 2);
assert.equal(shadow.acceptedByTarget.episodic, 1);
assert.equal(shadow.needsReviewByReason.temporary_preference_requires_review, 1);
assert.equal(shadow.needsReviewByReason.relationship_signal_requires_review, 1);
assert.equal(shadow.rejectedByReason.scene_only, 1);
assert.equal(shadow.rejectedByReason.producer_not_permitted, 1, "Direct Chat subjective reflection cannot enter Truth");
assert.equal(shadow.rejectedByReason.unsupported_kind, 1);

let providerCalls = 0;
const responseWithV2Metadata = await apiExtractMemoriesWithModelFallback({
  history: [{ id: sourceMessage.id, role: "user", text: sourceMessage.content }],
  characterName: character.name,
  apiKey: "test",
  model: "model-a",
  enableV2Shadow: true,
}, "model-b", async () => {
  providerCalls += 1;
  return { text: response, items: [], candidates: [], v2MetadataPresent: true };
});
assert.equal(providerCalls, 1, "V2 metadata is additive to the same logical extraction request");
assert.equal(responseWithV2Metadata.error, undefined);

const context = {
  character,
  characterId: character.id,
  relationId: "producer-relation",
  userIdentityId: "producer-user",
  conversationId: "direct:producer",
  recentMessages: [sourceMessage],
  existingMemories: [],
  scenario: "chat" as const,
  apiKey: "test",
  model: "model-a",
  createId: () => "producer-memory",
  currentTime: () => 100,
  formatContent: (items: readonly string[]) => items.join(";"),
};
let capturedProducerParams: { enableV2Shadow?: boolean } | undefined;
await MemoryService.extractMemories({ ...context, enableMemoryExtractionV2Shadow: true }, async (params) => {
  capturedProducerParams = params;
  return { items: [] };
});
assert.equal(capturedProducerParams?.enableV2Shadow, true, "automatic Direct Chat producer flag reaches the existing request");
let capturedLegacyParams: { enableV2Shadow?: boolean } | undefined;
await MemoryService.extractMemories(context, async (params) => {
  capturedLegacyParams = params;
  return { items: [] };
});
assert.equal(capturedLegacyParams?.enableV2Shadow, undefined, "legacy/manual callers remain unmodified");
const legacyOnly = await MemoryService.extractMemories(context, async () => ({ items: [base()] }));
const sameLegacyWithV2 = await MemoryService.extractMemories(context, async () => ({
  items: [base({ v2: v2() })],
  structuredCandidatesV2: [parsed.structuredCandidatesV2[0]!],
}));
assert.deepEqual(sameLegacyWithV2.acceptedClaims, legacyOnly.acceptedClaims, "V2 shadow metadata does not alter legacy claims");
assert.equal(sameLegacyWithV2.rejectedCandidateCount, legacyOnly.rejectedCandidateCount);
assert.deepEqual(sameLegacyWithV2.extractedMemories, legacyOnly.extractedMemories);
const v2OnlyResult = await MemoryService.extractMemories(context, async () => ({
  items: [],
  structuredCandidatesV2: [parsed.structuredCandidatesV2[3]!],
}));
assert.equal(v2OnlyResult.acceptedClaims.length, 0);
assert.equal(v2OnlyResult.rejectedCandidateCount, 0, "V2-only shadow candidates do not inflate legacy rejection counts");
assert.equal(v2OnlyResult.structuredCandidatesV2?.length, 1);

console.log("PASS Direct Chat V2 producer shadow, same-response compatibility, fail-open repair accounting, and admission characterization");
