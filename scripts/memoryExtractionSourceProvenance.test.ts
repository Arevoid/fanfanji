import assert from "node:assert/strict";
import { buildMemoryExtractionSourceEnvelope } from "../src/domain/memory/memoryExtractionSourceEnvelope";
import {
  bindDirectChatMemorySourceHints,
  resolveDirectChatMemoryActorTarget,
} from "../src/features/chat/services/directChatMemorySourceBinding";
import {
  parseKnowledgeExtractionOutputWithV2,
  parseOrRepairKnowledgeExtractionOutput,
} from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import { adaptDirectChatMemoryExtractionToCandidates } from "../src/features/chat/services/directChatMemoryCandidateAdapter";
import { observeDirectChatMemoryAdmissionShadow } from "../src/features/chat/services/directChatMemoryAdmissionShadow";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { apiExtractMemoriesWithModelFallback } from "../src/utils/apiHelper";
import type { Character, Message } from "../src/types";
import type { MemoryExtractionResult } from "../src/domain/memory/memoryTypes";

const character: Character = { id: "character-runtime", name: "角色", avatar: "", personality: "", backstory: "" };
const userMessage: Message = {
  id: "message-user",
  characterId: character.id,
  relationId: "relation-runtime",
  conversationId: "conversation-runtime",
  sender: "user",
  authorIdentityId: "identity-runtime",
  content: "我喜欢周末喝咖啡。",
  timestamp: 100,
};
const characterMessage: Message = {
  id: "message-character",
  characterId: character.id,
  relationId: "relation-runtime",
  conversationId: "conversation-runtime",
  sender: "character",
  senderId: character.id,
  content: "我会记住这件事。",
  timestamp: 200,
};
const envelope = buildMemoryExtractionSourceEnvelope({
  characterId: character.id,
  relationId: "relation-runtime",
  userIdentityId: "identity-runtime",
  conversationId: "conversation-runtime",
  recentMessages: [userMessage, characterMessage],
  parentActionId: "chat-action",
  extractionActionId: "extraction-action",
});

assert.deepEqual(envelope.allowedSourceMessageIds, ["message-user", "message-character"]);
assert.equal(envelope.messageSources[0]?.actorId, "identity-runtime");
assert.equal(envelope.messageSources[1]?.actorId, character.id);
assert.equal(JSON.stringify(envelope).includes(userMessage.content), false, "source envelope never carries message bodies");
assert.equal(envelope.parentActionId, "chat-action");
assert.equal(envelope.extractionActionId, "extraction-action");

const valid = bindDirectChatMemorySourceHints({
  envelope,
  modelSourceHints: ["message-character", "message-user", "message-user"],
  expectedScope: { characterId: character.id, relationId: "relation-runtime", userIdentityId: "identity-runtime", conversationId: "conversation-runtime" },
});
assert.equal(valid.status, "valid");
assert.deepEqual(valid.trustedSourceMessageIds, ["message-character", "message-user"], "trusted source order is deterministic");
assert.deepEqual(valid.duplicateSourceMessageIds, ["message-user"]);
assert.deepEqual(valid.sourceTimestamps, [200, 100], "source timestamps come from runtime metadata, not candidate temporal fields");
assert.equal(valid.authorship, "unknown", "mixed user/character evidence remains unknown");

const invalid = bindDirectChatMemorySourceHints({ envelope, modelSourceHints: ["foreign-message"] });
assert.equal(invalid.status, "invalid");
assert.deepEqual(invalid.invalidSourceMessageIds, ["foreign-message"]);
assert.deepEqual(invalid.trustedSourceMessageIds, []);

const mixed = bindDirectChatMemorySourceHints({ envelope, modelSourceHints: ["message-user", "foreign-message"] });
assert.equal(mixed.status, "partial");
assert.deepEqual(mixed.validatedSourceMessageIds, ["message-user"]);
assert.deepEqual(mixed.trustedSourceMessageIds, [], "partial validity never becomes trusted provenance");
assert.equal(mixed.partialValid, true);

const missing = bindDirectChatMemorySourceHints({ envelope });
assert.equal(missing.status, "missing");
assert.equal(missing.missingSource, true);

const crossBatch = bindDirectChatMemorySourceHints({
  envelope,
  modelSourceHints: ["message-user"],
  expectedScope: { conversationId: "other-conversation" },
});
assert.equal(crossBatch.status, "scope_mismatch");
assert.deepEqual(crossBatch.trustedSourceMessageIds, []);

const userOnlyEnvelope = buildMemoryExtractionSourceEnvelope({
  characterId: character.id,
  relationId: "relation-runtime",
  userIdentityId: "identity-runtime",
  conversationId: "conversation-runtime",
  recentMessages: [userMessage],
});
const userOnly = bindDirectChatMemorySourceHints({ envelope: userOnlyEnvelope, modelSourceHints: ["message-user"] });
assert.equal(userOnly.authorship, "user");
assert.deepEqual(
  resolveDirectChatMemoryActorTarget({ actorRole: "user", targetRole: "character", envelope }),
  { actorId: "identity-runtime", targetId: character.id },
);
assert.deepEqual(
  resolveDirectChatMemoryActorTarget({ actorRole: "relationship", targetRole: "other", envelope }),
  { actorId: "relation-runtime" },
);

const baseV2 = {
  schemaVersion: 2,
  kind: "event",
  statement: "用户喜欢周末喝咖啡。",
  temporalStatus: "past",
  sourceMessageIds: ["message-user"],
  evidenceQuote: "我喜欢周末喝咖啡。",
  actorRole: "user",
  targetRole: "character",
};
const missingCandidate = parseKnowledgeExtractionOutputWithV2(
  JSON.stringify({ ...baseV2, sourceMessageIds: undefined }),
  new Set(["message-user"]),
  { preserveUnvalidatedSourceHints: true, allowMissingSourceHints: true },
);
assert.equal(missingCandidate.structuredCandidatesV2.length, 1, "shadow parsing keeps missing provenance diagnosable");
assert.deepEqual(missingCandidate.structuredCandidatesV2[0]?.sourceMessageIds, []);
const duplicateCandidate = parseKnowledgeExtractionOutputWithV2(
  JSON.stringify({ ...baseV2, sourceMessageIds: ["message-user", "message-user"] }),
  new Set(["message-user"]),
  { preserveUnvalidatedSourceHints: true, allowMissingSourceHints: true },
);
assert.deepEqual(duplicateCandidate.structuredCandidatesV2[0]?.sourceMessageIds, ["message-user", "message-user"], "shadow parser preserves duplicate hints for diagnostics");
const extraction: MemoryExtractionResult = {
  extractedMemories: [],
  acceptedClaims: [],
  rejectedCandidateCount: 0,
  structuredCandidatesV2: [baseV2 as never],
  sourceEnvelope: envelope,
};
const adapted = adaptDirectChatMemoryExtractionToCandidates({
  extraction,
  sourceEnvelope: envelope,
  scope: { characterId: character.id, relationId: "relation-runtime", userIdentityId: "identity-runtime", conversationId: "conversation-runtime" },
  recordedAt: 300,
  createCandidateId: () => "candidate-runtime",
});
assert.equal(adapted.canonicalBindingSuccessCount, 1);
assert.deepEqual(adapted.candidates[0]?.provenance.sourceMessageIds, ["message-user"]);
assert.equal(adapted.candidates[0]?.provenance.authorship, "user");
assert.equal(adapted.candidates[0]?.provenance.actorId, "identity-runtime");
assert.equal(adapted.candidates[0]?.temporal.occurredAt, undefined, "source timestamp is not candidate temporal");
assert.equal(JSON.stringify(adapted).includes(userMessage.content), false);
const inferredEnvelopeAdapter = adaptDirectChatMemoryExtractionToCandidates({
  extraction,
  scope: { characterId: character.id, relationId: "relation-runtime", userIdentityId: "identity-runtime", conversationId: "conversation-runtime" },
  recordedAt: 300,
  createCandidateId: () => "candidate-inferred-envelope",
});
assert.equal(inferredEnvelopeAdapter.canonicalBindingSuccessCount, 1, "adapter uses the extraction result's runtime envelope by default");

const invalidExtraction: MemoryExtractionResult = {
  ...extraction,
  structuredCandidatesV2: [{ ...baseV2, sourceMessageIds: ["foreign-message"] } as never],
};
const invalidAdapted = adaptDirectChatMemoryExtractionToCandidates({
  extraction: invalidExtraction,
  sourceEnvelope: envelope,
  scope: { characterId: character.id, relationId: "relation-runtime", userIdentityId: "identity-runtime", conversationId: "conversation-runtime" },
  createCandidateId: () => "candidate-invalid",
});
assert.equal(invalidAdapted.invalidSourceReferenceCount, 1);
assert.equal(invalidAdapted.missingSourceReferenceCount, 1);
const invalidShadow = observeDirectChatMemoryAdmissionShadow({
  extraction: invalidExtraction,
  sourceEnvelope: envelope,
  scope: { characterId: character.id, relationId: "relation-runtime", userIdentityId: "identity-runtime", conversationId: "conversation-runtime" },
  createCandidateId: () => "candidate-invalid",
});
assert.equal(invalidShadow.invalidSourceReferenceCount, 1);
assert.equal(invalidShadow.rejectedByReason.missing_provenance, 1);

const reorderedExtraction: MemoryExtractionResult = {
  ...extraction,
  structuredCandidatesV2: [{ ...baseV2, sourceMessageIds: ["message-character", "message-user"] } as never],
};
const bothSourceExtraction: MemoryExtractionResult = {
  ...extraction,
  structuredCandidatesV2: [{ ...baseV2, sourceMessageIds: ["message-user", "message-character"] } as never],
};
const bothSource = adaptDirectChatMemoryExtractionToCandidates({
  extraction: bothSourceExtraction,
  sourceEnvelope: envelope,
  scope: { characterId: character.id, relationId: "relation-runtime", userIdentityId: "identity-runtime", conversationId: "conversation-runtime" },
  createCandidateId: () => "candidate-both-source",
});
const reordered = adaptDirectChatMemoryExtractionToCandidates({
  extraction: reorderedExtraction,
  sourceEnvelope: envelope,
  scope: { characterId: character.id, relationId: "relation-runtime", userIdentityId: "identity-runtime", conversationId: "conversation-runtime" },
  createCandidateId: () => "candidate-reordered",
});
const firstKey = (await import("../src/domain/memory/memoryCandidate")).buildMemoryCandidateIdempotencyKey(bothSource.candidates[0]!);
const reorderedKey = (await import("../src/domain/memory/memoryCandidate")).buildMemoryCandidateIdempotencyKey(reordered.candidates[0]!);
assert.equal(firstKey, reorderedKey, "reordered valid hints have the same deterministic idempotency key");

const preserved = parseKnowledgeExtractionOutputWithV2(
  JSON.stringify({ ...baseV2, sourceMessageIds: ["foreign-message"] }),
  new Set(["message-user"]),
  { preserveUnvalidatedSourceHints: true },
);
assert.equal(preserved.structuredCandidatesV2[0]?.sourceMessageIds[0], "foreign-message");
const legacyValidated = parseKnowledgeExtractionOutputWithV2(
  JSON.stringify({ ...baseV2, sourceMessageIds: ["foreign-message"] }),
  new Set(["message-user"]),
);
assert.equal(legacyValidated.structuredCandidatesV2.length, 0, "legacy V2 parser retains its validation behavior");

let repairCalls = 0;
const repaired = await parseOrRepairKnowledgeExtractionOutput({
  rawText: JSON.stringify({ ...baseV2, sourceMessageIds: ["foreign-message"] }),
  allowedMessageIds: new Set(["message-user"]),
  originalPrompt: "same batch",
  preserveUnvalidatedSourceHints: true,
  repair: async () => {
    repairCalls += 1;
    return "";
  },
});
assert.equal(repairCalls, 0, "runtime hint preservation does not add a repair request");
assert.equal(repaired.structuredCandidatesV2[0]?.sourceMessageIds[0], "foreign-message");

const extractionContext = {
  character,
  characterId: character.id,
  relationId: "relation-runtime",
  userIdentityId: "identity-runtime",
  conversationId: "conversation-runtime",
  recentMessages: [userMessage, characterMessage],
  existingMemories: [],
  scenario: "chat" as const,
  parentActionId: "chat-action",
  extractionActionId: "extraction-action",
  apiKey: "test",
  model: "model-a",
  createId: () => "memory-runtime",
  currentTime: () => 300,
  formatContent: (items: readonly string[]) => items.join(";"),
};
const extracted = await MemoryService.extractMemories(extractionContext, async () => ({ items: [] }));
assert.deepEqual(extracted.sourceEnvelope?.allowedSourceMessageIds, envelope.allowedSourceMessageIds);
assert.equal(extracted.sourceEnvelope?.parentActionId, "chat-action");
assert.equal(extracted.sourceEnvelope?.extractionActionId, "extraction-action");

let providerCalls = 0;
const fallbackHistories: string[][] = [];
const fallback = await apiExtractMemoriesWithModelFallback({
  history: [
    { id: "message-user", role: "user", text: userMessage.content },
    { id: "message-character", role: "model", text: characterMessage.content },
  ],
  characterName: character.name,
  apiKey: "test",
  model: "model-a",
  enableV2Shadow: true,
}, "model-b", async (params) => {
  providerCalls += 1;
  fallbackHistories.push(params.history.map((item) => item.id));
  return providerCalls === 1
    ? { text: "", items: [], error: "primary unavailable" }
    : { text: JSON.stringify(baseV2), items: [], candidates: [], v2MetadataPresent: true };
});
assert.equal(providerCalls, 2, "model fallback remains the existing second provider attempt");
assert.deepEqual(fallbackHistories[0], fallbackHistories[1], "repair/fallback keeps one canonical source universe");
assert.equal(fallback.error, undefined);

console.log("PASS runtime-owned extraction source envelope, deterministic source binding, provenance diagnostics, and legacy fail-open compatibility");
