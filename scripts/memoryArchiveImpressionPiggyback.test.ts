import assert from "node:assert/strict";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { saveKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { loadCharacterContinuity } from "../src/core/storage/repositories/characterContinuityRepository";
import { applyArchivedImpressions } from "../src/features/characterKnowledge/services/characterContinuityService";
import type { Character, Message } from "../src/types";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const content = "你生病那天我给你送了热粥，陪你等到退烧才回家。";
let requests = 0;
const result = await MemoryService.extractMemories({ ...scope, character: { id: "a", name: "验收" } as Character,
  recentMessages: [{ ...scope, id: "m", sender: "user", content, timestamp: 100 } as Message], existingMemories: [],
  scenario: "chat", apiKey: "synthetic", model: "synthetic", singlePass: true, createId: () => "archive", currentTime: () => 200,
  formatContent: rows => rows.join("\n") }, async () => {
  requests++;
  return { candidates: [{ statement: content, evidenceQuote: content, sourceMessageIds: ["m"], kind: "fact", subject: "user", temporalStatus: "past",
    valueAssessment: { quote: content, impact: 3, durability: 3, novelty: 2, confidence: .95, reason: "具体照顾经历" },
    impression: { category: "关怀", proposition: "原来你会默默照顾人，那天让我觉得很安心。", confidence: .65 } }] };
});
assert.equal(requests, 1);
assert.equal(result.impressionCandidates?.length, 1);
assert.equal(saveKnowledgeClaims(result.acceptedClaims).success, true);
applyArchivedImpressions(scope, result.impressionCandidates || [], 300);
const first = loadCharacterContinuity().value.impressions;
assert.equal(first.length, 1);
assert.equal(first[0].sourceClaimIds[0], result.acceptedClaims[0].id);
assert.match(first[0].proposition, /安心/);
applyArchivedImpressions(scope, result.impressionCandidates || [], 300);
assert.equal(loadCharacterContinuity().value.impressions.length, 1, "replay does not duplicate the impression");
applyArchivedImpressions({ ...scope, relationId: "foreign" }, result.impressionCandidates || [], 300);
assert.equal(loadCharacterContinuity().value.impressions.length, 1, "references cannot cross relations");
assert.equal(requests, 1, "saving optional impressions never requests another model");
console.log("Archive reflection piggybacks once, binds real source claims, deduplicates and isolates relations");
