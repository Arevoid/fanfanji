import assert from "node:assert/strict";
import type { Character, Message } from "../src/types";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { buildMemoryExtractionSourceEnvelope } from "../src/domain/memory/memoryExtractionSourceEnvelope";
import {
  buildMemoryExtractionLocalSourceRefTable,
  resolveMemoryExtractionSourceRefs,
} from "../src/domain/memory/memoryExtractionLocalSourceRefs";
import { buildMemoryExtractionSourceEnvelope as buildEnvelope } from "../src/domain/memory/memoryExtractionSourceEnvelope";
import {
  buildKnowledgeExtractionPrompt,
  parseOrRepairKnowledgeExtractionOutput,
} from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import { apiExtractMemoriesWithModelFallback } from "../src/utils/apiHelper";
import { adaptDirectChatMemoryExtractionToCandidates } from "../src/features/chat/services/directChatMemoryCandidateAdapter";
import { buildMemoryCandidateIdempotencyKey } from "../src/domain/memory/memoryCandidate";

const character: Character = { id: "local-ref-character", name: "角色", avatar: "", personality: "", backstory: "" };
const messages: Message[] = [
  {
    id: "canonical-message-a",
    characterId: character.id,
    relationId: "local-ref-relation",
    conversationId: "local-ref-conversation",
    sender: "user",
    authorIdentityId: "local-ref-user",
    content: "我喜欢周末喝咖啡。",
    timestamp: 100,
  },
  {
    id: "canonical-message-b",
    characterId: character.id,
    relationId: "local-ref-relation",
    conversationId: "local-ref-conversation",
    sender: "character",
    senderId: character.id,
    content: "我会记住这件事。",
    timestamp: 200,
  },
];
const envelope = buildMemoryExtractionSourceEnvelope({
  characterId: character.id,
  relationId: "local-ref-relation",
  userIdentityId: "local-ref-user",
  conversationId: "local-ref-conversation",
  recentMessages: messages,
});
const table = buildMemoryExtractionLocalSourceRefTable(envelope);

assert.deepEqual(table.refs.map((item) => item.ref), ["M1", "M2"]);
assert.deepEqual(table.refs.map((item) => item.messageId), ["canonical-message-a", "canonical-message-b"]);
assert.equal(table.refs[0]?.role, "user");
assert.equal(table.refs[1]?.timestamp, 200);
assert.deepEqual(
  buildMemoryExtractionLocalSourceRefTable(buildEnvelope({
    characterId: character.id,
    relationId: "local-ref-relation",
    userIdentityId: "local-ref-user",
    conversationId: "local-ref-conversation",
    recentMessages: messages,
  })).refs,
  table.refs,
  "same runtime message order gets the same deterministic refs",
);

const reordered = resolveMemoryExtractionSourceRefs(["M2", "M1", "M2"], table);
assert.deepEqual(reordered.canonicalMessageIds, ["canonical-message-b", "canonical-message-a"]);
assert.deepEqual(reordered.duplicateRefs, ["M2"]);
assert.deepEqual(reordered.invalidRefs, []);
assert.deepEqual(resolveMemoryExtractionSourceRefs(["canonical-message-a"], table).canonicalMessageIds, ["canonical-message-a"], "already-adapted compatibility callers remain accepted");
assert.deepEqual(resolveMemoryExtractionSourceRefs(["M999", "M-1", "message2", "ABC"], table).invalidRefs, ["M999", "M-1", "message2", "ABC"]);

const localPrompt = buildKnowledgeExtractionPrompt({
  characterName: character.name,
  sourceReferenceMode: "local",
  history: messages.map((message) => ({
    id: message.id === messages[0]?.id ? "M1" : "M2",
    role: message.sender === "user" ? "user" as const : "model" as const,
    text: message.content,
  })),
});
assert.match(localPrompt, /\[M1\]\[user\]/);
assert.match(localPrompt, /source ref/);
assert.match(localPrompt, /sourceMessageIds":\["M1"\]/);
assert.doesNotMatch(localPrompt, /canonical-message-a|canonical-message-b|messageId=/);

const candidate = (sourceMessageIds: string[]) => ({
  statement: "用户喜欢周末喝咖啡。",
  kind: "fact" as const,
  subject: "user" as const,
  temporalStatus: "present" as const,
  sourceMessageIds,
  evidenceQuote: "我喜欢周末喝咖啡。",
});
const baseContext = {
  character,
  characterId: character.id,
  relationId: "local-ref-relation",
  userIdentityId: "local-ref-user",
  conversationId: "local-ref-conversation",
  recentMessages: messages,
  existingMemories: [],
  apiKey: "test",
  model: "model-a",
  createId: () => "local-ref-memory",
  currentTime: () => 300,
  formatContent: (items: readonly string[]) => items.join(";"),
};

let capturedLocalParams: { history: Array<{ id: string }>; sourceReferenceMode?: string } | undefined;
const localExtraction = await MemoryService.extractMemories({ ...baseContext, scenario: "chat" as const }, async (params) => {
  capturedLocalParams = params;
  return { items: [candidate(["M1"]) ] };
});
assert.deepEqual(capturedLocalParams?.history.map((item) => item.id), ["M1", "M2"]);
assert.equal(capturedLocalParams?.sourceReferenceMode, "local");
assert.deepEqual(localExtraction.acceptedClaims[0]?.source.messageIds, ["canonical-message-a"]);
assert.equal(JSON.stringify(localExtraction).includes("M1"), false, "local refs never reach durable claim output");
assert.deepEqual(localExtraction.sourceEnvelope?.allowedSourceMessageIds, ["canonical-message-a", "canonical-message-b"]);
assert.equal(localExtraction.sourceEnvelope?.messageSources[0]?.actorId, "local-ref-user");
assert.equal(localExtraction.sourceEnvelope?.messageSources[0]?.timestamp, 100);

const invalidLocalExtraction = await MemoryService.extractMemories({ ...baseContext, scenario: "chat" as const }, async () => ({
  items: [candidate(["M999"])],
}));
assert.equal(invalidLocalExtraction.acceptedClaims.length, 0);
assert.equal(invalidLocalExtraction.rejectedCandidateCount, 1, "unknown local refs are rejected without a storage lookup");

const canonicalExtraction = await MemoryService.extractMemories({ ...baseContext, scenario: "manual-summary" as const }, async (params) => {
  assert.deepEqual(params.history.map((item) => item.id), ["canonical-message-a", "canonical-message-b"]);
  assert.equal(params.sourceReferenceMode, undefined, "canonical callers retain the historic request shape");
  return { items: [candidate(["canonical-message-a"]) ] };
});
assert.deepEqual(
  localExtraction.acceptedClaims.map((claim) => ({ statement: claim.statement, kind: claim.kind, source: claim.source.messageIds })),
  canonicalExtraction.acceptedClaims.map((claim) => ({ statement: claim.statement, kind: claim.kind, source: claim.source.messageIds })),
  "local-ref and canonical transport produce equivalent legacy claims",
);

const localV2 = await MemoryService.extractMemories({ ...baseContext, scenario: "chat" as const }, async () => ({
  items: [],
  structuredCandidatesV2: [{
    schemaVersion: 2,
    kind: "event",
    statement: "用户喜欢周末喝咖啡。",
    temporalStatus: "present",
    sourceMessageIds: ["M1", "M2", "M2"],
    evidenceQuote: "我喜欢周末喝咖啡。",
  }],
}));
assert.deepEqual(localV2.structuredCandidatesV2?.[0]?.sourceMessageIds, ["canonical-message-a", "canonical-message-b"], "V2 refs resolve before downstream adapters");
const candidateScope = {
  characterId: character.id,
  relationId: "local-ref-relation",
  userIdentityId: "local-ref-user",
  conversationId: "local-ref-conversation",
};
const localAdapted = adaptDirectChatMemoryExtractionToCandidates({
  extraction: localV2,
  sourceEnvelope: envelope,
  scope: candidateScope,
  recordedAt: 300,
  createCandidateId: () => "local-candidate",
});
const canonicalAdapted = adaptDirectChatMemoryExtractionToCandidates({
  extraction: {
    ...localV2,
    structuredCandidatesV2: localV2.structuredCandidatesV2?.map((item) => ({
      ...item,
      sourceMessageIds: ["canonical-message-a", "canonical-message-b"],
    })),
  },
  sourceEnvelope: envelope,
  scope: candidateScope,
  recordedAt: 300,
  createCandidateId: () => "canonical-candidate",
});
assert.equal(localAdapted.canonicalBindingSuccessCount, 1);
assert.deepEqual(localAdapted.candidates[0]?.provenance.sourceMessageIds, canonicalAdapted.candidates[0]?.provenance.sourceMessageIds);
assert.equal(
  buildMemoryCandidateIdempotencyKey(localAdapted.candidates[0]!),
  buildMemoryCandidateIdempotencyKey(canonicalAdapted.candidates[0]!),
  "local refs do not change downstream candidate identity",
);

let repairCalls = 0;
const unknownRef = await parseOrRepairKnowledgeExtractionOutput({
  rawText: JSON.stringify(candidate(["M999"])),
  allowedMessageIds: new Set(["M1", "M2"]),
  originalPrompt: localPrompt,
  preserveUnvalidatedSourceHints: true,
  repair: async () => {
    repairCalls += 1;
    return "";
  },
});
assert.equal(repairCalls, 0, "unknown local refs are a resolution failure, not an extra repair request");
assert.deepEqual(unknownRef.candidates[0]?.sourceMessageIds, ["M999"]);

let fallbackCalls = 0;
const fallbackHistories: string[][] = [];
const fallback = await apiExtractMemoriesWithModelFallback({
  history: [{ id: "M1", role: "user", text: messages[0]!.content }, { id: "M2", role: "model", text: messages[1]!.content }],
  sourceReferenceMode: "local",
  characterName: character.name,
  apiKey: "test",
  model: "model-primary",
}, "model-fallback", async (params) => {
  fallbackCalls += 1;
  fallbackHistories.push(params.history.map((item) => item.id));
  return fallbackCalls === 1
    ? { items: [], error: "primary unavailable", text: "" }
    : { items: [candidate(["M1"])], candidates: [candidate(["M1"])], text: "" };
});
assert.equal(fallbackCalls, 2, "provider fallback keeps its existing attempt behavior");
assert.deepEqual(fallbackHistories[0], ["M1", "M2"]);
assert.deepEqual(fallbackHistories[1], fallbackHistories[0], "fallback reuses the same local-ref universe");
assert.equal(fallback.error, undefined);

const repairPrompt = await parseOrRepairKnowledgeExtractionOutput({
  rawText: "普通文字，不是结构化候选",
  allowedMessageIds: new Set(["M1", "M2"]),
  originalPrompt: localPrompt,
  preserveUnvalidatedSourceHints: true,
  repair: async (prompt) => {
    assert.match(prompt, /\[M1\]/);
    return JSON.stringify(candidate(["M1"]));
  },
});
assert.equal(repairPrompt.repaired, true);
assert.deepEqual(repairPrompt.candidates[0]?.sourceMessageIds, ["M1"]);

console.log("PASS local source refs: deterministic map, prompt redaction, legacy/V2 resolution, invalid-ref no-repair, and fallback map stability");
