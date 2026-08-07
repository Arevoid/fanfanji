import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import { projectLegacySummary } from "../src/domain/characterCognitive/legacySummaryPolicy";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { buildChatPromptContext, formatChatPromptContext } from "../src/features/characterCognitive/promptAdapters/chatPromptAdapter";
import { buildDiaryPromptContext, formatDiaryPromptContext } from "../src/features/characterCognitive/promptAdapters/diaryPromptAdapter";
import type { Character } from "../src/types";

const character: Character = {
  id: "character-summary",
  name: "摘要测试角色",
  avatar: "",
  personality: "克制",
  backstory: "只相信已确认事实",
};
const relation = {
  ...createRelationship({ id: "relation-summary-a", characterId: character.id, userIdentityId: "identity-a", now: 1 }),
  compressedMemory: "旧摘要：用户曾经答应周末见面",
};
const buildContext = (events: CharacterCognitiveEventCandidate[] = []) => buildCharacterCognitiveContext({
  character,
  relation,
  memories: [],
  events,
  timeContext: { now: 10 },
  knowledgeBoundary: { known: [], unknown: [] },
});
const confirmedEvent: CharacterEvent = {
  id: "event-confirmed",
  relationId: relation.id,
  characterId: character.id,
  userIdentityId: relation.userIdentityId,
  kind: "offline_story_completed",
  summary: "已确认：双方周末见面",
  source: "offline_story:story-a:completed",
  occurredAt: 2,
  recordedAt: 3,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
};

const weakChat = buildChatPromptContext(buildContext());
assert.deepEqual(weakChat.relationship.legacySummary, {
  content: "旧摘要：用户曾经答应周末见面",
  source: "legacy-unverified",
});
assert.match(formatChatPromptContext(weakChat), /source=legacy-unverified/);
assert.match(formatDiaryPromptContext(buildDiaryPromptContext(buildContext())), /source=legacy-unverified/);

const confirmedChat = buildChatPromptContext(buildContext([{ event: confirmedEvent, promptVisibility: "safe" }]));
assert.equal(confirmedChat.relationship.legacySummary, undefined, "confirmed CharacterEvent outranks legacy summary");
assert.doesNotMatch(formatChatPromptContext(confirmedChat), /旧摘要：用户曾经答应周末见面/);

const confirmedClaimChat = buildChatPromptContext(buildContext(), { hasConfirmedClaim: true });
assert.equal(confirmedClaimChat.relationship.legacySummary, undefined, "confirmed Claim outranks legacy summary");
const derivedSummaryChat = buildChatPromptContext(buildContext(), { hasDerivedSummary: true });
assert.equal(derivedSummaryChat.relationship.legacySummary, undefined, "derived summary outranks legacy summary");

assert.equal(projectLegacySummary({
  summary: "foreign relation summary",
  summaryRelationId: "relation-summary-b",
  targetRelationId: relation.id,
  hasConfirmedEvent: false,
  hasConfirmedClaim: false,
  hasDerivedSummary: false,
}), undefined, "foreign relation summaries fail closed");

console.log("legacyCognitiveSummaryPolicy.test.ts passed");
