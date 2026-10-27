import assert from "node:assert/strict";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { appendKnowledgeClaims } from "../src/domain/characterKnowledge/knowledgeConflictPolicy";
import type { Character, Message } from "../src/types";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const old: KnowledgeClaim = { ...scope, id: "old", kind: "preference", subject: "user", statement: "我喜欢咖啡", temporalStatus: "present",
  truthStatus: "asserted", status: "active", confidence: .85, recordedAt: 10, userConfirmed: false, visibility: "relation_private", schemaVersion: 1,
  source: { kind: "user_message", authorship: "user", messageIds: ["previous"], evidenceQuote: "我喜欢咖啡", producer: "test", evidenceKey: "old" } };
const content = "我现在不喜欢咖啡了。";
const context = { ...scope, character: { id: "a", name: "验收" } as Character,
  recentMessages: [{ ...scope, id: "m", sender: "user", content, timestamp: 100 } as Message],
  existingMemories: [], existingClaims: [old], scenario: "chat" as const, apiKey: "synthetic", model: "synthetic",
  createId: () => "test", currentTime: () => 200, formatContent: (rows: readonly string[]) => rows.join("\n"),
  singlePass: true, requireFactResolution: true,
  prepareSemanticRegistry: async () => { throw Error("no extra identity request"); },
  reviewAuthorizedSettings: async () => { throw Error("no extra settings request"); } };
let calls = 0;
const result = await MemoryService.extractMemories(context, async params => {
  calls++; assert.equal(params.singlePass, true);
  return { candidates: [{ statement: content, evidenceQuote: content, sourceMessageIds: ["m"], kind: "preference", subject: "user", temporalStatus: "present",
    factDecision: { entity: "用户", attribute: "咖啡喜好", value: "不喜欢", operation: "change", confidence: .99, reason: "明确变化", targetClaimId: old.id,
      previousQuote: old.statement, currentQuote: content },
    valueAssessment: { quote: content, impact: 2, durability: 3, novelty: 2, confidence: .95, reason: "明确当前喜好变化" } }] };
});
assert.equal(calls, 1);
assert.equal(result.acceptedClaims.length, 1);
const stored = appendKnowledgeClaims([old], result.acceptedClaims);
assert.ok(stored.find(claim => claim.id === old.id)?.supersededById, "explicit local preference change still supersedes old fact without a review API");
assert.equal(stored.find(claim => claim.id !== old.id)?.statement, content);
calls = 0;
const empty = await MemoryService.extractMemories(context, async () => { calls++; return { candidates: [] }; });
assert.equal(calls, 1, "empty valuable source does not buy recovery requests");
assert.equal(empty.apiError, undefined);
assert.equal(empty.acceptedClaims.length, 0);
console.log("Single-request archive preserves explicit updates and never adds empty-result reviews");
