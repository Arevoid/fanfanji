import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildKnowledgeExtractionPrompt,
  getRuntimeExtractionLineage,
  hydrateRuntimeExtractionLineage,
  parseKnowledgeExtractionOutputWithV2,
} from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { MemoryCandidate } from "../src/domain/memory/memoryCandidate";
import type { MemoryExtractionResult } from "../src/domain/memory/memoryTypes";
import {
  adaptDirectChatMemoryExtractionToCandidates,
} from "../src/features/chat/services/directChatMemoryCandidateAdapter";
import {
  matchDirectChatMemoryCandidates,
  type DirectChatMemoryBridgeRuntimeContext,
  type DirectChatMemoryLegacyCandidate,
} from "../src/features/chat/services/directChatMemoryAdmissionBridge";

const scope = {
  characterId: "transport-character",
  relationId: "transport-relation",
  userIdentityId: "transport-user",
  conversationId: "transport-conversation",
};
const runtime: DirectChatMemoryBridgeRuntimeContext = {
  scope,
  allowedSourceRefs: ["m1", "m2"],
  trustedProvenance: true,
};

const raw = JSON.stringify([
  {
    statement: "用户喜欢咖啡。",
    kind: "fact",
    subject: "user",
    temporalStatus: "present",
    sourceMessageIds: ["m1"],
    evidenceQuote: "喜欢咖啡",
    v2: {
      schemaVersion: 2,
      kind: "fact",
      epistemicStatus: "objective",
      authorityRole: "durable_candidate",
      actorRole: "user",
      targetRole: "character",
    },
  },
  {
    statement: "用户计划周末阅读。",
    kind: "plan",
    subject: "user",
    temporalStatus: "future",
    sourceMessageIds: ["m2"],
    evidenceQuote: "周末阅读",
    v2: {
      schemaVersion: 2,
      kind: "plan",
      planLifecycle: "active",
      epistemicStatus: "objective",
      actorRole: "user",
      targetRole: "character",
    },
  },
]);

const parsed = parseKnowledgeExtractionOutputWithV2(raw, new Set(["m1", "m2"]));
assert.equal(parsed.candidates.length, 2, "legacy projections are produced");
assert.equal(parsed.structuredCandidatesV2.length, 2, "V2 projections are produced");
assert.equal(parsed.runtimeLineageTransport.legacy.length, 2, "legacy sidecar is bounded and complete");
assert.equal(parsed.runtimeLineageTransport.v2.length, 2, "V2 sidecar is bounded and complete");

// Simulate the backend DTO JSON boundary. The sidecar is the only transport
// field; projection objects themselves remain unchanged model-facing shapes.
const legacyDto = JSON.parse(JSON.stringify(parsed.candidates)) as typeof parsed.candidates;
const v2Dto = JSON.parse(JSON.stringify(parsed.structuredCandidatesV2)) as typeof parsed.structuredCandidatesV2;
const transported = JSON.parse(JSON.stringify(parsed.runtimeLineageTransport));
assert.equal(getRuntimeExtractionLineage(legacyDto[0]), undefined, "JSON parse starts without private lineage");
assert.equal(getRuntimeExtractionLineage(v2Dto[0]), undefined, "JSON parse starts without V2 private lineage");
hydrateRuntimeExtractionLineage({ legacy: legacyDto, v2: v2Dto }, transported);

// 1–5: same raw item shares one token; different raw items differ; stringify/
// parse + hydration restores both projection sides.
const legacyLineage0 = getRuntimeExtractionLineage(legacyDto[0]);
const v2Lineage0 = getRuntimeExtractionLineage(v2Dto[0]);
const legacyLineage1 = getRuntimeExtractionLineage(legacyDto[1]);
const v2Lineage1 = getRuntimeExtractionLineage(v2Dto[1]);
assert.ok(legacyLineage0, "transported legacy lineage is present");
assert.equal(legacyLineage0, v2Lineage0, "same raw item retains one shared lineage");
assert.ok(legacyLineage1, "second legacy lineage is present");
assert.equal(legacyLineage1, v2Lineage1, "second raw item retains one shared lineage");
assert.notEqual(legacyLineage0, legacyLineage1, "different raw items retain different lineage");
assert.equal((legacyDto[0] as unknown as Record<string, unknown> | undefined)?.runtimeLineage, undefined, "lineage is not added to legacy model shape");
assert.equal((v2Dto[0] as unknown as Record<string, unknown> | undefined)?.runtimeLineage, undefined, "lineage is not added to V2 model shape");

const legacyCandidates: DirectChatMemoryLegacyCandidate[] = legacyDto.map((item, index) => ({
  id: `legacy-${index}`,
  runtimeLineageId: getRuntimeExtractionLineage(item),
  diagnostic: { decision: "accepted", candidateKind: item.kind as MemoryCandidate["candidateKind"], temporalStatus: item.temporalStatus, reason: "accepted" },
  candidateKind: item.kind as MemoryCandidate["candidateKind"],
  temporalStatus: item.temporalStatus,
  sourceRefs: item.sourceMessageIds,
  scope,
  provenanceTrusted: true,
  provenance: { producer: "memory-extractor.chat.v1", sourceType: "user_message", actorId: scope.userIdentityId, targetId: scope.characterId },
  policy: { epistemicStatus: "objective", durability: "unknown", planLifecycle: item.kind === "plan" ? "active" : "unknown", resolvedAuthorityRole: "durable_candidate" },
}));
const extractionForAdapter: MemoryExtractionResult = {
  extractedMemories: [],
  acceptedClaims: [],
  rejectedCandidateCount: 0,
  structuredCandidatesV2: v2Dto,
};
const adapted = adaptDirectChatMemoryExtractionToCandidates({ extraction: extractionForAdapter, scope });
assert.equal(getRuntimeExtractionLineage(v2Dto[0]), adapted.candidates[0]?.runtimeLineageId, "adapter reads hydrated V2 lineage");
const matched = matchDirectChatMemoryCandidates({
  legacy: legacyCandidates,
  v2: adapted.candidates.map((candidate) => ({
    candidate,
    decision: { state: "accepted", reason: "accepted_fact", candidateId: candidate.candidateId, idempotencyKey: `key-${candidate.candidateId}`, authority: "candidate_only", target: "truth" },
    runtime,
  })),
  runtime,
});
// 6–10: Tier-1 exact, mismatch safety, duplicate safety, partial fallback,
// and absent-sidecar compatibility.
assert.equal(matched.matches.filter((item) => item.correlation === "exact").length, 2, "shared lineage reaches Tier-1 exact");
assert.equal(matched.pairCandidateMatrix.filter((entry) => entry.lineageStatus === "shared").length, 2, "matrix counts only same-lineage pairs as shared");
const mismatch = matchDirectChatMemoryCandidates({
  legacy: [legacyCandidates[0]!],
  v2: [{ ...matched.matches.find((item) => item.v2.length > 0)!.v2[0]!, candidate: { ...matched.matches.find((item) => item.v2.length > 0)!.v2[0]!.candidate, runtimeLineageId: "different-lineage" } }],
  runtime,
});
assert.equal(mismatch.matches.some((item) => item.correlation === "exact"), false, "different lineage never becomes exact");
assert.equal(mismatch.pairCandidateMatrix[0]?.lineageStatus, "mismatch", "lineage mismatch is explicit in diagnostics");
const duplicate = matchDirectChatMemoryCandidates({
  legacy: [legacyCandidates[0]!, { ...legacyCandidates[0]!, id: "legacy-duplicate" }],
  v2: adapted.candidates.slice(0, 1).map((candidate) => ({ candidate, decision: { state: "accepted", reason: "accepted_fact", candidateId: candidate.candidateId, idempotencyKey: "dup", authority: "candidate_only", target: "truth" }, runtime })),
  runtime,
});
assert.equal(duplicate.matches.some((item) => item.correlation === "conflict" || item.correlation === "ambiguous"), true, "duplicate lineage is fail-safe");
const partial = matchDirectChatMemoryCandidates({ legacy: [legacyCandidates[0]!], v2: [{ ...matched.matches.find((item) => item.v2.length > 0)!.v2[0]!, candidate: { ...matched.matches.find((item) => item.v2.length > 0)!.v2[0]!.candidate, runtimeLineageId: undefined } }], runtime });
assert.equal(partial.matches.some((item) => item.correlation === "exact"), false, "partial lineage must not use structural fallback");
assert.equal(partial.matches.some((item) => item.correlation === "unmatched_legacy" || item.correlation === "unmatched_v2"), true, "partial lineage remains fail-safe and unmatched");
assert.equal(partial.pairCandidateMatrix[0]?.lineageStatus, "partial", "partial lineage is explicitly diagnosed");
const noSidecar = matchDirectChatMemoryCandidates({ legacy: [{ ...legacyCandidates[0]!, runtimeLineageId: undefined }], v2: [{ ...matched.matches.find((item) => item.v2.length > 0)!.v2[0]!, candidate: { ...matched.matches.find((item) => item.v2.length > 0)!.v2[0]!.candidate, runtimeLineageId: undefined } }], runtime });
assert.equal(noSidecar.matches.some((item) => item.correlation === "exact"), true, "absent transport preserves legacy structural behavior");

// 11–16: no canonical/storage leakage and no provider/prompt request leakage.
const context = {
  character: { id: scope.characterId, name: "角色", avatar: "", personality: "", backstory: "" },
  ...scope,
  recentMessages: [
    { id: "m1", characterId: scope.characterId, relationId: scope.relationId, conversationId: scope.conversationId, sender: "user" as const, content: "我喜欢咖啡", timestamp: 1 },
    { id: "m2", characterId: scope.characterId, relationId: scope.relationId, conversationId: scope.conversationId, sender: "user" as const, content: "我计划周末阅读", timestamp: 2 },
  ],
  existingMemories: [],
  scenario: "chat" as const,
  apiKey: "test-only",
  model: "test-model",
  createId: () => "memory-id",
  currentTime: () => 1,
  formatContent: (items: readonly string[]) => items.join(";"),
};
const extracted = await MemoryService.extractMemories(context, async () => ({ items: legacyDto, candidates: legacyDto, structuredCandidatesV2: v2Dto }));
const acceptedJson = JSON.stringify(extracted.acceptedClaims);
const memoryJson = JSON.stringify(extracted.extractedMemories);
assert.equal(acceptedJson.includes(legacyLineage0!), false, "lineage is absent from KnowledgeClaim");
assert.equal(memoryJson.includes(legacyLineage0!), false, "lineage is absent from MemoryItem");
assert.equal(JSON.stringify({ summary: extracted.acceptedClaims, projectionJob: extracted.extractedMemories }).includes(legacyLineage0!), false, "lineage is absent from summary/projection payloads");
const prompt = buildKnowledgeExtractionPrompt({ characterName: "角色", history: context.recentMessages.map((message) => ({ id: message.id, role: "user" as const, text: message.content })), includeV2Shadow: true });
assert.equal(prompt.includes("runtimeLineage"), false, "lineage is absent from Prompt");
assert.equal(JSON.stringify({ history: context.recentMessages, message: prompt }).includes(legacyLineage0!), false, "lineage is absent from Provider request material");
const ledgerSource = fs.readFileSync(path.join(process.cwd(), "src/core/monitoring/aiRequestLedger.ts"), "utf8");
assert.equal(ledgerSource.includes("runtimeLineage"), false, "persistent Ledger implementation has no lineage field");
const workerSource = fs.readFileSync(path.join(process.cwd(), "src/cloudflare/worker.ts"), "utf8");
assert.match(workerSource, /structuredCandidatesV2:\s*repaired\.structuredCandidatesV2/u, "Cloudflare extraction DTO preserves additive V2 projections");
assert.match(workerSource, /v2MetadataPresent:\s*repaired\.v2MetadataPresent/u, "Cloudflare extraction DTO preserves V2 presence marker");

// 17–20: bounded sidecar, no user-visible token export, and architecture
// isolation from canonical/UI/other feature authorities.
assert.ok(parsed.runtimeLineageTransport.legacy.length <= 64 && parsed.runtimeLineageTransport.v2.length <= 64, "transport is per-response bounded");
assert.equal(JSON.stringify({ candidates: legacyDto, structuredCandidatesV2: v2Dto }).includes(legacyLineage0!), false, "user-visible candidate serialization has no token");
const allowedTransportFiles = new Set([
  "src/features/characterKnowledge/services/knowledgeExtractionProtocol.ts",
  "src/utils/apiHelper.ts",
  "src/cloudflare/worker.ts",
]);
const sourceRoot = path.join(process.cwd(), "src");
const walk = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const leakedFiles = walk(sourceRoot)
  .filter((file) => /\.(?:ts|tsx)$/u.test(file))
  .filter((file) => fs.readFileSync(file, "utf8").includes("runtimeLineageTransport"))
  .map((file) => path.relative(process.cwd(), file).replaceAll("\\", "/"))
  .filter((file) => !allowedTransportFiles.has(file));
assert.deepEqual(leakedFiles, [], "transport field remains outside UI/canonical/other feature authorities");

console.log("PASS Stage 4D-10F transient lineage DTO sidecar, JSON hydration, Tier-1, safety, privacy and architecture isolation");
