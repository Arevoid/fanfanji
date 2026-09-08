import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { createCharacterMemoryRepository, type CharacterMemoryReadScope } from "../src/domain/memory/CharacterMemoryRepository";
import {
  buildDirectChatMemoryView,
  compareDirectChatMemoryShadow,
} from "../src/features/chat/services/directChatMemoryShadowView";
import type { MemoryItem } from "../src/types";

const scope: CharacterMemoryReadScope = {
  characterId: "character-a",
  relationId: "relation-a",
  userIdentityId: "identity-a",
  conversationId: "conversation-a",
};
const otherScope: CharacterMemoryReadScope = {
  characterId: "character-a",
  relationId: "relation-b",
  userIdentityId: "identity-b",
  conversationId: "conversation-b",
};

const claim = (id: string, claimScope: CharacterMemoryReadScope, statement: string, sourceMessageId: string): KnowledgeClaim => ({
  id,
  ...claimScope,
  kind: "fact",
  subject: "relationship",
  statement,
  truthStatus: "confirmed",
  temporalStatus: "past",
  source: { kind: "user_message", authorship: "user", messageIds: [sourceMessageId], producer: "test", evidenceKey: sourceMessageId },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
});
const claimA = claim("claim-a", scope, "A 的已确认事实", "message-a");
const claimB = claim("claim-b", otherScope, "B 的私有事实", "message-b");
const summaryA: ConversationSummaryRecord = {
  id: "summary-a",
  ...scope,
  summary: "A 的派生摘要",
  sourceMessageIds: ["message-a"],
  sourceClaimIds: [claimA.id],
  generatedAt: 12,
  generator: "test",
  projectionVersion: 1,
  status: "active",
  schemaVersion: 1,
};
const summaryB: ConversationSummaryRecord = { ...summaryA, id: "summary-b", ...otherScope, summary: "B 的派生摘要", sourceClaimIds: [claimB.id], sourceMessageIds: ["message-b"] };
const eventA: CharacterEvent = {
  id: "event-a",
  relationId: scope.relationId,
  characterId: scope.characterId,
  userIdentityId: scope.userIdentityId,
  kind: "relationship_created",
  summary: "A 的关系事件",
  source: "relationship",
  occurredAt: 8,
  recordedAt: 9,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
};
const memoryMirror: MemoryItem = {
  id: "legacy-mirror",
  characterId: scope.characterId,
  relationId: scope.relationId,
  userIdentityId: scope.userIdentityId,
  conversationId: scope.conversationId,
  content: "A 的已确认事实（旧镜像）",
  timestamp: 11,
  sourceKnowledgeClaimIds: [claimA.id],
};
const uniqueLegacy: MemoryItem = {
  id: "legacy-unique",
  characterId: scope.characterId,
  relationId: scope.relationId,
  userIdentityId: scope.userIdentityId,
  conversationId: scope.conversationId,
  content: "A 的旧兼容事实",
  timestamp: 7,
};
const partialLegacy: MemoryItem = {
  id: "legacy-partial",
  characterId: scope.characterId,
  relationId: scope.relationId,
  content: "缺少 identity 的旧记录",
  timestamp: 6,
};
const unscopedLegacy: MemoryItem = {
  id: "legacy-unscoped",
  characterId: scope.characterId,
  content: "没有 relation 的旧记录",
  timestamp: 5,
};
const liveClaim = claim("claim-live", scope, "当前消息已经出现的事实", "message-live");
const claims = [claimA, claimB, liveClaim];
const summaries = [summaryA, summaryB];
const memories = [memoryMirror, uniqueLegacy, partialLegacy, unscopedLegacy];
const events = [eventA];
const sourceSnapshot = JSON.stringify({ claims, summaries, memories, events });
const repository = createCharacterMemoryRepository({ claims, summaries, memories, events });

const scoped = repository.readForScope(scope, 100);
assert.deepEqual(scoped.records.filter((record) => record.kind === "truth").map((record) => record.id).sort(), ["claim-a", "claim-live"]);
assert.equal(scoped.records.some((record) => record.id === claimB.id), false, "other relation Truth must not be visible");
assert.equal(scoped.dropped.some((drop) => drop.id === "legacy-partial" && drop.reason === "missing_scope"), true);
assert.equal(scoped.dropped.some((drop) => drop.id === "legacy-unscoped" && drop.reason === "missing_scope"), true);
assert.equal(scoped.dropped.some((drop) => drop.id === summaryB.id && drop.reason === "scope_mismatch"), true);

const view = buildDirectChatMemoryView({
  scope,
  queryText: "A 的事实",
  liveSourceMessageIds: ["message-live"],
  maxItems: 6,
  maxCharacters: 4800,
  now: 100,
  repository,
});
assert.equal(view.records.some((record) => record.id === "claim-live"), false, "live source duplicate is dropped");
assert.equal(view.records.some((record) => record.id === "legacy-mirror"), false, "canonical mirror is dropped");
assert.equal(view.records.some((record) => record.id === "summary-a"), false, "Truth source suppresses derived summary");
assert.equal(view.records.some((record) => record.id === "legacy-unique"), true, "unique legacy fallback remains observable");
assert.equal(view.diagnostics.droppedByReason.live_source_duplicate, 1);
assert.equal(view.diagnostics.droppedByReason.canonical_mirror, 1);
assert.equal(view.diagnostics.droppedByReason.duplicate_source, 1);
assert.equal(view.diagnostics.unscopedLegacyCount, 2);
assert.equal("content" in view.diagnostics, false, "diagnostics contain IDs/counts/reasons, never record text");
assert.equal(JSON.stringify(view.diagnostics).includes("A 的"), false);

const withEvents = buildDirectChatMemoryView({ scope, repository, includeEvents: true, queryText: "", now: 100 });
const eventRecord = withEvents.records.find((record) => record.id === eventA.id);
assert.equal(eventRecord?.kind, "event");
assert.equal(eventRecord?.authority, "event");
assert.equal(eventRecord?.canonical, false);

const first = buildDirectChatMemoryView({ scope, repository, queryText: "事实", now: 100 });
const second = buildDirectChatMemoryView({ scope, repository, queryText: "事实", now: 100 });
assert.deepEqual(second, first, "the shadow view is deterministic for the same read inputs");

const comparison = compareDirectChatMemoryShadow([
  { id: "claim-a", kind: "truth", sourceIds: ["claim-a", "message-a"] },
  { id: "summary-a", kind: "summary", sourceIds: ["summary-a", "claim-a", "message-a"] },
], view);
assert.deepEqual(comparison.onlyInProduction, ["summary-a"]);
assert.ok(comparison.onlyInShadow.includes("legacy-unique"));
assert.deepEqual(comparison.kindMismatches, []);
assert.ok(comparison.shadowDiagnostics.droppedCount > 0);

assert.equal(JSON.stringify({ claims, summaries, memories, events }), sourceSnapshot, "facade/view must not mutate source records");

const shadowSource = readFileSync(new URL("../src/features/chat/services/directChatMemoryShadowView.ts", import.meta.url), "utf8");
assert.doesNotMatch(shadowSource, /apiChat|PromptComposer|buildDirectChatSystemInstruction|localStorage|saveMemories/);
assert.doesNotMatch(shadowSource, /fetch\s*\(/);

console.log("PASS CharacterMemoryRepository shadow facade: scope, authority, mirror/live dedup, diagnostics, determinism, and no-provider/no-write guards");
