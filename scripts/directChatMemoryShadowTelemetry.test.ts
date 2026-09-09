import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { createCharacterMemoryRepository } from "../src/domain/memory/CharacterMemoryRepository";
import type { MemoryItem } from "../src/types";
import {
  buildDirectChatProductionMemorySelection,
  compareDirectChatMemoryShadowDetailed,
  observeDirectChatMemoryShadow,
} from "../src/features/chat/services/directChatMemoryShadowComparison";
import { buildDirectChatMemoryView } from "../src/features/chat/services/directChatMemoryShadowView";
import { contributeDirectReplyTruthContext } from "../src/features/characterKnowledge/services/directReplyTruthContextContributor";
import { formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";

const scope = {
  characterId: "character-shadow",
  relationId: "relation-shadow",
  userIdentityId: "identity-shadow",
  conversationId: "conversation-shadow",
};

const otherRelationScope = { ...scope, relationId: "relation-other", conversationId: "conversation-other" };
const otherIdentityScope = { ...scope, userIdentityId: "identity-other" };
const otherConversationScope = { ...scope, conversationId: "conversation-other" };

const claim = (id: string, statement: string, overrides: Partial<KnowledgeClaim> = {}): KnowledgeClaim => ({
  ...scope,
  id,
  kind: "fact",
  subject: "user",
  statement,
  truthStatus: "confirmed",
  temporalStatus: "present",
  source: {
    kind: "user_message",
    authorship: "user",
    messageIds: [`message:${id}`],
    producer: "test",
    evidenceKey: id,
  },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 100,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
  ...overrides,
});

const summary = (id: string, sourceClaimIds: string[] = [], overrides: Partial<ConversationSummaryRecord> = {}): ConversationSummaryRecord => ({
  ...scope,
  id,
  summary: `summary-${id}`,
  sourceMessageIds: sourceClaimIds.map((claimId) => `message:${claimId}`),
  sourceClaimIds,
  generatedAt: 100,
  generator: "test",
  projectionVersion: 1,
  status: "active",
  schemaVersion: 1,
  ...overrides,
});

const legacy = (id: string, content: string, overrides: Partial<MemoryItem> = {}): MemoryItem => ({
  id,
  characterId: scope.characterId,
  relationId: scope.relationId,
  userIdentityId: scope.userIdentityId,
  conversationId: scope.conversationId,
  content,
  timestamp: 100,
  ...overrides,
});

const shadow = (claims: readonly KnowledgeClaim[], summaries: readonly ConversationSummaryRecord[] = [], memories: readonly MemoryItem[] = [], input: Partial<Parameters<typeof buildDirectChatMemoryView>[0]> = {}) => buildDirectChatMemoryView({
  scope,
  queryText: "",
  maxItems: 8,
  maxCharacters: 4_800,
  now: 200,
  repository: createCharacterMemoryRepository({ claims, summaries, memories, events: [] }),
  ...input,
});

const exactClaim = claim("truth-exact", "exact fact");
const exactProduction = [{
  id: exactClaim.id,
  kind: "truth" as const,
  sourceIds: ["message:truth-exact"],
  authority: "authoritative" as const,
  contentLength: exactClaim.statement.length,
}];
const exactComparison = compareDirectChatMemoryShadowDetailed(exactProduction, shadow([exactClaim]));
assert.equal(exactComparison.equivalenceStatus, "equivalent", "Case 1 exact Truth equivalence");
assert.deepEqual(exactComparison.matchedIds, [exactClaim.id]);

const authorityClaim = claim("truth-authority", "authoritative fact");
const authorityComparison = compareDirectChatMemoryShadowDetailed(
  [{ id: "summary-authority", kind: "summary", sourceIds: [authorityClaim.id, "message:truth-authority"], authority: "derived", contentLength: 20 }],
  shadow([authorityClaim], [summary("summary-authority", [authorityClaim.id])]),
);
assert.equal(authorityComparison.equivalenceStatus, "authority_difference", "Case 2 Truth beats Summary");
assert.equal(authorityComparison.authorityDifferences[0]?.shadowKind, "truth");

const canonicalComparison = compareDirectChatMemoryShadowDetailed(
  [{ id: "legacy-mirror", kind: "legacy-memory", sourceIds: ["truth-canonical"], authority: "legacy", contentLength: 12 }],
  shadow([claim("truth-canonical", "canonical fact")]),
);
assert.equal(canonicalComparison.equivalenceStatus, "expected_legacy_difference", "Case 3 canonical mirror is expected legacy difference");
assert.equal(canonicalComparison.canonicalMirrorDifferences[0]?.relatedId, "truth-canonical");
assert.deepEqual(canonicalComparison.matchedSourceGroups, [["truth-canonical"]]);

const missingScopeId = "legacy-missing-scope";
const missingScopeComparison = compareDirectChatMemoryShadowDetailed(
  [{ id: missingScopeId, kind: "legacy-memory", sourceIds: [], authority: "legacy", contentLength: 10 }],
  shadow([], [], [legacy(missingScopeId, "missing scope", { relationId: undefined, userIdentityId: undefined, conversationId: undefined })]),
);
assert.equal(missingScopeComparison.equivalenceStatus, "scope_difference", "Case 4 missing scope is isolated");
assert.deepEqual(missingScopeComparison.scopeDifferences, [{ id: missingScopeId, reason: "missing_scope" }]);

const liveClaim = claim("truth-live", "already in live history", { source: { ...claim("source", "unused").source, messageIds: ["live-message"], evidenceKey: "live" } });
const liveComparison = compareDirectChatMemoryShadowDetailed(
  [{ id: liveClaim.id, kind: "truth", sourceIds: ["live-message"], authority: "authoritative", contentLength: 10 }],
  shadow([liveClaim], [], [], { liveSourceMessageIds: ["live-message"] }),
);
assert.equal(liveComparison.liveSourceDuplicateDifferences[0]?.id, liveClaim.id, "Case 5 live duplicate is reported");
assert.equal(liveComparison.productionOnlyReasons[liveClaim.id]?.includes("live_source_duplicate"), true);

const supersededClaim = claim("truth-superseded", "old fact", { supersededById: "truth-new" });
const supersededComparison = compareDirectChatMemoryShadowDetailed(
  [{ id: supersededClaim.id, kind: "truth", sourceIds: [`message:${supersededClaim.id}`], authority: "authoritative", temporalStatus: "past", contentLength: 8 }],
  shadow([supersededClaim]),
);
assert.equal(supersededComparison.equivalenceStatus, "temporal_difference", "Case 6 superseded claim is temporal difference");
assert.equal(supersededComparison.temporalDifferences[0]?.reason, "superseded");

const budgetClaims = [claim("budget-a", "a".repeat(80)), claim("budget-b", "b".repeat(80))];
const budgetComparison = compareDirectChatMemoryShadowDetailed(
  budgetClaims.map((item) => ({ id: item.id, kind: "truth" as const, sourceIds: [`message:${item.id}`], authority: "authoritative" as const, contentLength: item.statement.length })),
  shadow(budgetClaims, [], [], { maxItems: 1, maxCharacters: 4800 }),
);
assert.equal(budgetComparison.equivalenceStatus, "budget_difference", "Case 7 budget boundary is explicit");
assert.equal(budgetComparison.budgetDifference?.shadowDroppedByBudget, 1);

const isolatedClaims = [
  claim("relation-isolated", "current relation"),
  claim("other-relation", "other relation", otherRelationScope),
  claim("other-identity", "other identity", otherIdentityScope),
  claim("other-conversation", "other conversation", otherConversationScope),
];
const isolatedView = shadow(isolatedClaims);
assert.deepEqual(isolatedView.records.map((record) => record.id), ["relation-isolated"], "Cases 8-10 relation, identity, and conversation boundaries remain exact");

const provenanceView = shadow([], [], [legacy("legacy-no-source", "legacy without provenance")]);
const provenanceComparison = compareDirectChatMemoryShadowDetailed([], provenanceView);
assert.deepEqual(provenanceComparison.missingProvenanceDifferences.map((difference) => difference.id), ["legacy-no-source"], "missing provenance stays an explicit diagnostic");

const noBodyReport = JSON.stringify(exactComparison);
assert.doesNotMatch(noBodyReport, /exact fact|summary-summary-authority|canonical fact|missing scope|already in live history/);
assert.equal("content" in exactComparison, false, "comparison report contains no memory body");

const offRepository = {
  readAll: () => { throw new Error("disabled shadow must not read"); },
  readForScope: () => { throw new Error("disabled shadow must not read"); },
};
assert.equal(observeDirectChatMemoryShadow({
  enabled: false,
  production: exactProduction,
  shadow: { scope, repository: offRepository },
}), undefined, "shadow OFF is a strict zero-work guard");

const truthInput = {
  scope,
  queryText: "exact",
  limit: 4,
  maxCharacters: 4_800,
  now: 200,
  claims: [exactClaim],
  summaries: [],
  corrections: [],
  alreadyPromptedMessageIds: [],
  alreadyPromptedTexts: [],
};
const offResult = contributeDirectReplyTruthContext(truthInput);
const onResult = contributeDirectReplyTruthContext({
  ...truthInput,
  memoryShadowDiagnostics: { enabled: true, memories: [], events: [] },
});
assert.equal(onResult.memoryShadowDiagnostics?.equivalenceStatus, "equivalent");
assert.equal(formatTruthRetrievalForPrompt(onResult), formatTruthRetrievalForPrompt(offResult), "shadow diagnostics never enter production Prompt");
assert.equal(onResult.memoryShadowDiagnostics?.shadowDiagnostics.droppedCount, 0);

const shadowSource = readFileSync(new URL("../src/features/chat/services/directChatMemoryShadowComparison.ts", import.meta.url), "utf8");
assert.doesNotMatch(shadowSource, /localStorage|indexedDB|fetch\s*\(|apiChat|PromptComposer|systemInstruction|provider/i, "shadow comparison stays local and provider-free");
assert.doesNotMatch(shadowSource, /ledger|requestPayload|responseBody/i, "shadow comparison does not add Ledger or response telemetry");

console.log("PASS Direct Chat memory shadow telemetry: opt-in guard, exact/source equivalence, authority/scope/temporal/budget/mirror/live diagnostics, 10 isolation fixtures, prompt/provider/storage safety");
