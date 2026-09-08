import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contributeDirectReplyTruthContext } from "../src/features/characterKnowledge/services/directReplyTruthContextContributor";
import {
  countTruthRetrievalRecords,
  formatTruthRetrievalForPrompt,
  retrieveTruthForPrivatePrompt,
  type TruthRetrievalInput,
} from "../src/features/characterKnowledge/services/truthRetrievalService";
import type {
  BehaviorCorrectionRecord,
  ConversationSummaryRecord,
  KnowledgeClaim,
} from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const scope = {
  relationId: "relation-direct",
  characterId: "character-direct",
  userIdentityId: "identity-direct",
  conversationId: "direct:relation-direct",
};

const makeClaim = (
  id: string,
  statement: string,
  overrides: Partial<KnowledgeClaim> = {},
): KnowledgeClaim => ({
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
    messageIds: [`source:${id}`],
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

const makeSummary = (
  id: string,
  summary: string,
  overrides: Partial<ConversationSummaryRecord> = {},
): ConversationSummaryRecord => ({
  ...scope,
  id,
  summary,
  sourceMessageIds: [],
  sourceClaimIds: [],
  generatedAt: 100,
  generator: "test",
  projectionVersion: 1,
  status: "active",
  schemaVersion: 1,
  ...overrides,
});

const makeCorrection = (id: string, instruction: string): BehaviorCorrectionRecord => ({
  ...scope,
  id,
  instruction,
  sourceMessageIds: [],
  createdAt: 100,
  updatedAt: 100,
  status: "active",
  schemaVersion: 1,
});

const claims = [
  makeClaim("truth-a", "用户确认喜欢电影", { recordedAt: 110 }),
  makeClaim("truth-b", "用户周末会去看电影", { recordedAt: 109, temporalStatus: "future", kind: "plan" }),
  makeClaim("truth-other-character", "另一个角色的电影事实", {
    characterId: "character-other",
    relationId: "relation-other",
    userIdentityId: "identity-other",
    conversationId: "direct:relation-other",
  }),
  makeClaim("truth-other-relation", "另一个关系的事实", {
    relationId: "relation-other",
    conversationId: "direct:relation-other",
  }),
  makeClaim("truth-other-identity", "另一个身份的事实", {
    userIdentityId: "identity-other",
  }),
];
const summaries = [
  makeSummary("summary-independent", "只属于当前关系的派生摘要"),
  makeSummary("summary-repeats-truth", "重复具体事实的摘要", { sourceClaimIds: ["truth-a"] }),
  makeSummary("summary-other-relation", "另一个关系的摘要", {
    relationId: "relation-other",
    conversationId: "direct:relation-other",
  }),
];
const corrections = [makeCorrection("correction-direct", "保持克制，不替用户做决定")];

const normalInput: TruthRetrievalInput = {
  scope,
  queryText: "电影",
  limit: 4,
  maxCharacters: 4_800,
  alreadyPromptedMessageIds: ["history-1", "source:already-live"],
  alreadyPromptedTexts: ["当前对话已经出现的内容"],
  now: 200,
  claims: [...claims, makeClaim("already-live", "当前对话已经出现的事实")],
  summaries,
  corrections,
};

const regenerateInput: TruthRetrievalInput = {
  ...normalInput,
  // Regenerate keeps its own history boundary and therefore supplies its own
  // already-prompted material. The Truth seam receives the same contract.
  alreadyPromptedMessageIds: ["regenerate-history-1", "source:already-live"],
  alreadyPromptedTexts: ["当前对话已经出现的内容", "需要重新生成的上一轮用户消息"],
};

const normalResult = retrieveTruthForPrivatePrompt(normalInput);
const regenerateResult = retrieveTruthForPrivatePrompt(regenerateInput);
const normalContributorResult = contributeDirectReplyTruthContext(normalInput);
const regenerateContributorResult = contributeDirectReplyTruthContext(regenerateInput);

assert.deepEqual(normalContributorResult, normalResult, "the contributor preserves the existing normal Truth result exactly");
assert.deepEqual(regenerateContributorResult, regenerateResult, "the contributor preserves regenerate Truth semantics exactly");

assert.deepEqual(normalResult.projection.confirmedFacts.map((claim) => claim.id), ["truth-a"]);
assert.deepEqual(normalResult.projection.futurePlans.map((claim) => claim.id), ["truth-b"]);
assert.equal(normalResult.projection.confirmedFacts.some((claim) => claim.id.includes("other")), false);
assert.deepEqual(normalResult.summaries.map((summary) => summary.id), ["summary-independent"]);
assert.deepEqual(normalResult.corrections.map((correction) => correction.id), ["correction-direct"]);
assert.equal(normalResult.promptCharacterLimit, 4_800);
assert.equal(countTruthRetrievalRecords(normalResult), 4, "claims, correction, and summary share one total Truth budget");

const alreadyPromptedResult = retrieveTruthForPrivatePrompt({
  ...normalInput,
  claims: [makeClaim("already-live", "当前对话已经出现的事实")],
  summaries: [makeSummary("summary-live-window", "当前对话的压缩摘要", {
    sourceMessageIds: ["source:already-live"],
    sourceClaimIds: ["already-live"],
  })],
  corrections: [],
});
assert.equal(alreadyPromptedResult.projection.confirmedFacts.length, 0, "source message IDs suppress already-live Truth");
assert.equal(alreadyPromptedResult.summaries.length, 0, "a summary whose source window is already live is suppressed");

const textDuplicateResult = retrieveTruthForPrivatePrompt({
  ...normalInput,
  claims: [makeClaim("text-duplicate", "用户周末会去看电影")],
  summaries: [],
  corrections: [],
  alreadyPromptedTexts: ["用户周末会去看电影。"],
});
assert.equal(textDuplicateResult.projection.futurePlans.length, 0, "normalized text duplicates remain suppressed");

assert.deepEqual(
  formatTruthRetrievalForPrompt(normalResult),
  formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt(normalInput)),
  "the formatter remains outside the retrieval seam and is deterministic",
);
assert.match(formatTruthRetrievalForPrompt(normalResult), /Confirmed facts/);
assert.match(formatTruthRetrievalForPrompt(normalResult), /对话摘要（非权威补充）/);
assert.match(formatTruthRetrievalForPrompt(normalResult), /保持克制/);
assert.doesNotMatch(formatTruthRetrievalForPrompt(normalResult), /另一个关系|另一个角色|另一个身份/);

assert.deepEqual(
  {
    scope: normalInput.scope,
    queryText: normalInput.queryText,
    limit: normalInput.limit,
    maxCharacters: normalInput.maxCharacters,
    claims: normalInput.claims,
    summaries: normalInput.summaries,
    corrections: normalInput.corrections,
  },
  {
    scope: regenerateInput.scope,
    queryText: regenerateInput.queryText,
    limit: regenerateInput.limit,
    maxCharacters: regenerateInput.maxCharacters,
    claims: regenerateInput.claims,
    summaries: regenerateInput.summaries,
    corrections: regenerateInput.corrections,
  },
  "normal and regenerate share only the Truth retrieval contract; their history boundary stays caller-owned",
);
assert.notDeepEqual(normalInput.alreadyPromptedMessageIds, regenerateInput.alreadyPromptedMessageIds);
assert.notDeepEqual(normalInput.alreadyPromptedTexts, regenerateInput.alreadyPromptedTexts);
assert.deepEqual(normalResult, retrieveTruthForPrivatePrompt(normalInput), "normal Truth retrieval is deterministic");
assert.deepEqual(regenerateResult, retrieveTruthForPrivatePrompt(regenerateInput), "regenerate Truth retrieval is deterministic");

const contributorSource = readFileSync(new URL("../src/features/characterKnowledge/services/directReplyTruthContextContributor.ts", import.meta.url), "utf8");
assert.match(contributorSource, /retrieveTruthForPrivatePrompt/);
assert.doesNotMatch(contributorSource, /localStorage|indexedDB|React|apiChat|requestAi|memoryExtract|summar/u, "Truth contributor must stay provider-free and storage-free");

const appChatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const regenerationSource = readFileSync(new URL("../src/features/chat/hooks/useChatRegenerationAction.ts", import.meta.url), "utf8");
assert.match(appChatSource, /contributeDirectReplyTruthContext/);
assert.match(regenerationSource, /contributeDirectReplyTruthContext/);
assert.doesNotMatch(regenerationSource, /retrieveTruthForPrivatePrompt/);

console.log("PASS direct reply Truth characterization: scope, duplicate suppression, budget, summary/correction semantics, and formatting boundary");
