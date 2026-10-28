import assert from "node:assert/strict";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character } from "../src/types";
import { buildKnowledgeExtractionPrompt, parseOrRepairKnowledgeExtractionOutput } from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import { apiExtractMemories } from "../src/utils/apiHelper";
import { ApiRequestError } from "../src/utils/fetchWithTimeout";

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
const originalFetch = globalThis.fetch;
try {
  let requests: {url: string; body: any}[] = [];
  globalThis.fetch = (async (url, init) => {
    requests.push({url: String(url), body: JSON.parse(String(init?.body))});
    return Response.json({text: "unstructured reply"});
  }) as typeof fetch;
  let observed = "";
  const invalid = await MemoryService.extractMemories({...context, character: {...context.character, personality: "UNRELATED_PERSONA"},
    onFailedResponse: response => { observed = response.text || ""; }}, apiExtractMemories);
  assert.ok(invalid.apiError);
  assert.equal(observed, "unstructured reply");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/chat");
  assert.equal(requests[0].body.timeoutMs, 180_000);
  assert.ok(requests[0].body.message.includes(message.content), "source stays unchanged");
  assert.ok(!requests[0].body.message.includes("UNRELATED_PERSONA"));
  for (const reply of ["The prompt could not be submitted. The prompt contains sensitive words that violate Google's policy.", "ordinary prose"]) {
    requests = [];
    globalThis.fetch = (async () => { requests.push({url: "", body: {}}); return Response.json({text: reply}); }) as typeof fetch;
    const failure = await MemoryService.extractMemories(context, apiExtractMemories);
    assert.ok(failure.apiError);
    assert.equal(requests.length, 1, "no format repair or fallback calls");
    assert.equal(failure.acceptedClaims.length, 0);
  }
  requests = [];
  globalThis.fetch = (async () => { requests.push({url: "", body: {}}); throw new ApiRequestError("timeout", "timeout", {timeoutMs: 180_000}); }) as typeof fetch;
  const timeout = await MemoryService.extractMemories(context, apiExtractMemories);
  assert.ok(timeout.apiError);
  assert.equal(requests.length, 1, "timeout never starts another request");
} finally { globalThis.fetch = originalFetch; }
console.log("PASS immediate summary single-pass: one extraction, zero ancillary review, failures remain failures");
