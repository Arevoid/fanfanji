import assert from "node:assert/strict";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character } from "../src/types";
import { buildKnowledgeExtractionPrompt, parseOrRepairKnowledgeExtractionOutput } from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";

const message = { id: "m1", characterId: "c", relationId: "r", sender: "user" as const,
  content: "我一直怕打雷。", timestamp: 1 };
let calls = 0, reviews = 0;
const context = {
  character: { id: "c", name: "Test" } as Character,
  characterId: "c", relationId: "r", userIdentityId: "u", conversationId: "conv",
  singlePass: true, requireFactResolution: true,
  recentMessages: [message], existingMemories: [], existingClaims: [], scenario: "immediate-summary" as const,
  apiKey: "synthetic", model: "test", createId: () => "claim-test", currentTime: () => 1,
  formatContent: (items: readonly string[]) => items.join("\n"),
  reviewAuthorizedSettings: async () => { reviews++; throw new Error("unexpected ancillary API"); },
};
const result = await MemoryService.extractMemories(context, async () => {
  calls++;
  return { items: [{ statement: "用户一直怕打雷。", kind: "preference", subject: "user",
    temporalStatus: "present", sourceMessageIds: ["m1"], evidenceQuote: message.content,
    valueAssessment: { quote: message.content, impact: 2, durability: 2, novelty: 1, confidence: .99, reason: "稳定恐惧" },
    settingReview: { decision: "new_experience", confidence: .99, reason: "来源明确" } }] };
});
assert.equal(result.apiError, undefined);
assert.equal(calls, 1);
assert.equal(reviews, 0, "immediate summary must not start an independent settings review");
calls = 0;
const failure = await MemoryService.extractMemories(context, async () => {
  calls++; return { error: "provider unavailable" };
});
assert.equal(calls, 1);
assert.equal(failure.apiError, "provider unavailable");
assert.equal(failure.acceptedClaims.length, 0);
const prompt = buildKnowledgeExtractionPrompt({ characterName: "Test", history: [], singlePass: true,
  memorySettings: [{ id: "setting1", text: "Test喜欢阅读" }] });
assert.match(prompt, /单次整理/);
assert.match(prompt, /setting1/);
let repairs = 0;
const parsed = await parseOrRepairKnowledgeExtractionOutput({ rawText: "unstructured reply", allowedMessageIds: new Set(["m1"]),
  originalPrompt: prompt, allowRepair: false, repair: async () => { repairs++; return "[]"; } });
assert.equal(repairs, 0, "single pass parsing must not create a hidden repair request");
assert.equal(parsed.repaired, false);
console.log("PASS immediate summary single-pass: one extraction, zero ancillary review, failures remain failures");
