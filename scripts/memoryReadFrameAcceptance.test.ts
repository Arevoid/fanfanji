import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { Character, OfflineStory, UserSettings } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { saveKnowledgeClaims, loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { supersedeKnowledgeClaim } from "../src/domain/characterKnowledge/knowledgeConflictPolicy";
import { projectKnowledgeReadFrame } from "../src/domain/characterKnowledge/knowledgeReadFrame";
import { captureOfflineMemoryReadFrame, buildOfflineFrameMemoryContext } from "../src/features/offline/services/offlineMemoryReadFrame";
import { contributeSemanticDirectReplyTruthContext } from "../src/features/characterKnowledge/services/semanticMemoryRecallService";
import { explainTruthProjection, formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
import type { SemanticMemoryIndex } from "../src/domain/memory/semanticMemoryIndex";
import { buildRelationshipCognitiveProjection } from "../src/features/characterLife/services/relationshipCognitiveProjectionService";
import { CHARACTER_CONTINUITY_KEY } from "../src/core/storage/repositories/characterContinuityRepository";
import { emptyCharacterContinuity } from "../src/domain/memory/characterContinuity";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const fact = (id: string, statement: string, recordedAt: number): KnowledgeClaim => ({ ...scope, id, statement, recordedAt, kind: "preference", subject: "user", temporalStatus: "present", truthStatus: "asserted",
  confidence: .9, userConfirmed: false, status: "active", visibility: "relation_private", schemaVersion: 1, source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: id, messageIds: [id], statementAt: recordedAt } });
const old = { ...fact("old", "用户喜欢咖啡", 100), coreMemory: true, factIdentity: { entityId: "user", attributeId: "taste", entityLabel: "用户", attributeLabel: "咖啡偏好" } };
const next = fact("next", "用户现在不喜欢咖啡", 300);
const changed = supersedeKnowledgeClaim([old], scope, old.id, next, "change");
assert.equal(changed[0].truthStatus, "asserted"); assert.equal(changed[0].validTo, 300); assert.equal(changed[1].coreMemory, true); assert.equal(changed[1].factIdentity?.attributeId, "taste");
assert.equal(projectKnowledgeReadFrame(changed, 200)[0].supersededById, undefined);
assert.equal(projectKnowledgeReadFrame(changed, 200).length, 1);
assert.equal(projectKnowledgeReadFrame(supersedeKnowledgeClaim([old], scope, old.id, next, "correction"), 200).length, 0, "corrected mistakes must not be resurrected");
saveKnowledgeClaims([old]);
const relation = { id: "r", characterId: "a", userIdentityId: "u", conversationId: "c", relationship: "friend", createdAt: 1, updatedAt: 1 } as CharacterRelationship;
const frame = captureOfflineMemoryReadFrame({ memberIds: ["a"], characters: [{ id: "a" } as Character], relationships: [relation], userIdentityId: "u", now: 200 });
const story = { id: "story", characterId: "a", relationId: "r", conversationId: "c", ownerIdentityId: "u", createdAt: 200, sourceChatId: "a", memoryReadFrame: frame } as OfflineStory;
saveKnowledgeClaims([...changed, fact("future", "用户还喜欢咖啡味糖果", 400)]);
const offlineInput = { story, characterId: "a", relation, settings: {} as UserSettings, query: "咖啡偏好" };
const frozen = await buildOfflineFrameMemoryContext(offlineInput);
assert.match(frozen, /用户喜欢咖啡/); assert.doesNotMatch(frozen, /不喜欢|糖果/);
assert.equal(await buildOfflineFrameMemoryContext({ ...offlineInput, story: { ...story, sourceChatId: undefined } }), "", "IF/director without explicit import cannot read online memory");
assert.equal(await buildOfflineFrameMemoryContext({ ...offlineInput, relation: { ...relation, userIdentityId: "foreign" } }), "");
saveKnowledgeClaims(loadKnowledgeClaims().value.map((claim) => claim.id === old.id ? { ...claim, status: "retracted", truthStatus: "retracted" } : claim));
assert.doesNotMatch(await buildOfflineFrameMemoryContext(offlineInput), /用户喜欢咖啡/, "withdrawn captured evidence must disappear");
saveKnowledgeClaims(changed);
let index: SemanticMemoryIndex | undefined; let writes = 0;
const vectorInput = { visible: true, now: 400, configuration: { enabled: true, apiEndpoint: "https://synthetic.test/v1", apiKey: "synthetic", model: "synthetic" },
  retrieval: { scope, claims: changed, summaries: [], corrections: [], queryText: "咖啡", now: 400 }, readClaims: () => changed,
  readIndex: async (_scope: typeof scope, provider: string) => index || { version: 1 as const, scope, provider, entries: [] },
  writeIndex: async (value: SemanticMemoryIndex) => { index = structuredClone(value); writes++; }, request: async (params: { texts: readonly string[] }) => params.texts.map(() => [1, 0]) };
await contributeSemanticDirectReplyTruthContext({ ...vectorInput, indexOnly: true });
const before = JSON.stringify(index); const beforeWrites = writes;
const [past, current] = await Promise.all([
  contributeSemanticDirectReplyTruthContext({ ...vectorInput, retrieval: { ...vectorInput.retrieval, knownAt: 200 } }),
  contributeSemanticDirectReplyTruthContext(vectorInput),
]);
assert.match(formatTruthRetrievalForPrompt(past), /用户喜欢咖啡/); assert.doesNotMatch(formatTruthRetrievalForPrompt(past), /不喜欢/);
assert.match(formatTruthRetrievalForPrompt(current), /不喜欢/);
const afterNormal = writes;
await contributeSemanticDirectReplyTruthContext({ ...vectorInput, retrieval: { ...vectorInput.retrieval, knownAt: 200 } });
assert.equal(writes, afterNormal, "as-of reads never rewrite the current vector index"); assert.ok(beforeWrites > 0 && before.length > 0);
assert.equal(explainTruthProjection({ ...vectorInput.retrieval, knownAt: 200 }).find((record) => record.claimId === old.id)?.included, true);
const [privateRead, publicRead, deduplicatedRead] = await Promise.all([
  contributeSemanticDirectReplyTruthContext(vectorInput),
  contributeSemanticDirectReplyTruthContext({ ...vectorInput, retrieval: { ...vectorInput.retrieval, scenario: "public" } }),
  contributeSemanticDirectReplyTruthContext({ ...vectorInput, retrieval: { ...vectorInput.retrieval, alreadyPromptedMessageIds: [next.id] } }),
]);
assert.match(formatTruthRetrievalForPrompt(privateRead), /不喜欢/);
assert.equal(formatTruthRetrievalForPrompt(publicRead), "", "public reads cannot join a private in-flight result");
assert.doesNotMatch(formatTruthRetrievalForPrompt(deduplicatedRead), /不喜欢/, "different recent context cannot reuse an incompatible in-flight projection");
saveKnowledgeClaims([old]);
values.set(CHARACTER_CONTINUITY_KEY, JSON.stringify({ ...emptyCharacterContinuity(), impressions: [
  { id: "old-view", scope, category: "care", themeKey: "theme", proposition: "以前觉得对方比较冷淡", confidence: .6, sourceClaimIds: [old.id], status: "superseded", recordedAt: 150, growth: { trust: -.03 } },
  { id: "later-view", scope, category: "care", themeKey: "theme", proposition: "后来觉得对方很体贴", confidence: .6, sourceClaimIds: [old.id], status: "active", recordedAt: 350, supersedesId: "old-view", growth: { trust: .03 } },
] }));
const historicalGrowth = buildRelationshipCognitiveProjection({ relation, events: [], now: 200 }).state?.dimensions?.trust;
const currentGrowth = buildRelationshipCognitiveProjection({ relation, events: [], now: 400 }).state?.dimensions?.trust;
assert.ok(historicalGrowth !== undefined && currentGrowth !== undefined && historicalGrowth < currentGrowth,
  "regeneration behaviour dimensions use the historical view, not a later personality overlay");
console.log("PASS read frames: change versus correction, preserved core identity, frozen explicit offline import, no IF/foreign/future/withdrawn knowledge, concurrent current/as-of vector reads and read-only index");
