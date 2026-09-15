import assert from "node:assert/strict";
import {
  parseKnowledgeExtractionOutputWithV2,
  parseKnowledgeExtractionOutputWithV2WithTelemetry,
  parseOrRepairKnowledgeExtractionOutputWithDiagnostics,
} from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import { parseOpenAiTextWithTelemetry } from "../src/server/textProtocolAdapters";
import { apiExtractMemories } from "../src/utils/apiHelper";
import {
  aggregateAiRequestLedgerAccounting,
  clearInMemoryAiRequestLedgerForTests,
  loadAiRequestLedger,
} from "../src/core/monitoring/aiRequestLedger";

const allowedMessageIds = new Set(["m1"]);
const candidate = {
  statement: "用户喜欢清淡早餐",
  kind: "preference",
  subject: "user",
  temporalStatus: "present",
  sourceMessageIds: ["m1"],
  evidenceQuote: "我喜欢清淡早餐",
};

const parse = (rawText: string) => parseKnowledgeExtractionOutputWithV2WithTelemetry(rawText, allowedMessageIds);

const valid = parse(JSON.stringify(candidate));
assert.equal(valid.parsed.candidates.length, 1);
assert.equal(valid.structuredOutputTelemetry.wrapperKind, "plain_json");
assert.equal(valid.structuredOutputTelemetry.jsonParseStage, "json");
assert.equal(valid.structuredOutputTelemetry.jsonParseSucceeded, true);
assert.equal(valid.structuredOutputTelemetry.failureReasonCode, "none");
assert.equal(valid.structuredOutputTelemetry.finalCandidateCount, 1);

const fenced = parse(`\n\`\`\`json\n${JSON.stringify(candidate)}\n\`\`\``);
assert.equal(fenced.structuredOutputTelemetry.wrapperKind, "json_fence");
assert.equal(fenced.parsed.candidates.length, 1);

const jsonl = parse(`\`\`\`jsonl\n${JSON.stringify(candidate)}\n${JSON.stringify(candidate)}\n\`\`\``);
assert.equal(jsonl.structuredOutputTelemetry.wrapperKind, "jsonl_fence");
assert.equal(jsonl.structuredOutputTelemetry.jsonlAttempted, true);
assert.equal(jsonl.structuredOutputTelemetry.jsonlAcceptedCount, 2);
assert.equal(jsonl.parsed.candidates.length, 2);

const prose = parse(`Here is the answer: ${JSON.stringify(candidate)}`);
assert.equal(prose.parsed.candidates.length, 0);
assert.equal(prose.structuredOutputTelemetry.wrapperKind, "prose_wrapper");
assert.equal(prose.structuredOutputTelemetry.failureStage, "wrapper");
assert.equal(prose.structuredOutputTelemetry.failureReasonCode, "prose_wrapper");

const malformed = parse("{not-json}");
assert.equal(malformed.structuredOutputTelemetry.failureStage, "json_parse");
assert.equal(malformed.structuredOutputTelemetry.failureReasonCode, "json_parse_failed");

const truncated = parse('{"statement":"用户喜欢清淡早餐"');
assert.equal(truncated.structuredOutputTelemetry.failureStage, "json_parse");
assert.equal(truncated.structuredOutputTelemetry.failureReasonCode, "truncated_json");

const schemaRejected = parse(JSON.stringify({ statement: "不完整候选" }));
assert.equal(schemaRejected.parsed.candidates.length, 0);
assert.equal(schemaRejected.structuredOutputTelemetry.failureStage, "schema");
assert.equal(schemaRejected.structuredOutputTelemetry.failureReasonCode, "schema_rejected");
assert.notEqual(schemaRejected.structuredOutputTelemetry.schemaRejectReasonCode, "none");

const validEmpty = parse("[]");
assert.equal(validEmpty.parsed.candidates.length, 0);
assert.equal(validEmpty.structuredOutputTelemetry.jsonParseSucceeded, true);
assert.equal(validEmpty.structuredOutputTelemetry.jsonRootKind, "array");
assert.equal(validEmpty.structuredOutputTelemetry.failureReasonCode, "valid_empty");

const openAiString = parseOpenAiTextWithTelemetry(JSON.stringify({
  choices: [{ message: { content: "[]" }, finish_reason: "stop" }],
}));
assert.equal(openAiString.text, "[]");
assert.equal(openAiString.structuredOutputTelemetry.responseEnvelopeKind, "openai_choices");
assert.equal(openAiString.structuredOutputTelemetry.messageContentKind, "string");
assert.equal(openAiString.structuredOutputTelemetry.finishReasonKind, "stop");

const openAiParts = parseOpenAiTextWithTelemetry(JSON.stringify({
  choices: [{ message: { content: [{ type: "text", text: "[]" }] } }],
}));
assert.equal(openAiParts.text, "[]");
assert.equal(openAiParts.structuredOutputTelemetry.messageContentKind, "text_parts");
assert.equal(openAiParts.structuredOutputTelemetry.contentPartCount, 1);

const unknownEnvelope = parseOpenAiTextWithTelemetry(JSON.stringify({
  output: [{ content: [{ type: "output_text", text: "[]" }] }],
}));
assert.equal(unknownEnvelope.text, "");
assert.equal(unknownEnvelope.structuredOutputTelemetry.responseEnvelopeKind, "unknown");
assert.equal(unknownEnvelope.structuredOutputTelemetry.textPresent, false);

const unsupportedContent = parseOpenAiTextWithTelemetry(JSON.stringify({
  choices: [{ message: { content: [{ type: "image_url", image_url: { url: "fixture" } }] } }],
}));
assert.equal(unsupportedContent.text, "");
assert.equal(unsupportedContent.structuredOutputTelemetry.responseEnvelopeKind, "openai_choices");
assert.equal(unsupportedContent.structuredOutputTelemetry.messageContentKind, "unknown");

let repairCalls = 0;
const repaired = await parseOrRepairKnowledgeExtractionOutputWithDiagnostics({
  rawText: "plain prose",
  allowedMessageIds,
  originalPrompt: "synthetic extraction fixture",
  repair: async () => {
    repairCalls += 1;
    return JSON.stringify(candidate);
  },
});
assert.equal(repairCalls, 1);
assert.equal(repaired.repaired, true);
assert.equal(repaired.candidates.length, 1);
assert.equal(repaired.structuredOutputTelemetry.fallbackAttempted, true);
assert.equal(repaired.structuredOutputTelemetry.fallbackReasonCode, "repair_request");

// Compatibility guard: telemetry must be additive and never alter parser output.
const compatibility = parseKnowledgeExtractionOutputWithV2(JSON.stringify(candidate), allowedMessageIds);
assert.deepEqual(valid.parsed.candidates, compatibility.candidates);
assert.deepEqual(valid.parsed.structuredCandidatesV2, compatibility.structuredCandidatesV2);
assert.equal(valid.parsed.v2MetadataPresent, compatibility.v2MetadataPresent);
const telemetryJson = JSON.stringify(valid.structuredOutputTelemetry);
assert.equal(telemetryJson.includes(candidate.statement), false);
assert.equal(telemetryJson.includes(candidate.evidenceQuote), false);
assert.equal(telemetryJson.includes("apiKey"), false);
assert.equal(telemetryJson.includes("Authorization"), false);

// Regression: structural failure is normalized inside the ledger lifecycle,
// so a failed logical extraction cannot disappear as a successful request.
const originalFetch = globalThis.fetch;
const ledgerStorage = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => ledgerStorage.get(key) ?? null,
    setItem: (key: string, value: string) => { ledgerStorage.set(key, value); },
    removeItem: (key: string) => { ledgerStorage.delete(key); },
  },
};
clearInMemoryAiRequestLedgerForTests();
globalThis.fetch = (async () => Response.json({ candidates: [], text: "plain prose" })) as typeof fetch;
const failedExtraction = await apiExtractMemories({
  history: [{ id: "m1", role: "user", text: "synthetic history" }],
  characterName: "synthetic character",
  apiKey: "synthetic-key",
  model: "synthetic-model",
});
assert.match(failedExtraction.error || "", /无法识别的结构化结果/);
const failureLedger = loadAiRequestLedger(Date.now() + 1_000);
assert.equal(failureLedger.length, 1);
assert.equal(failureLedger[0].status, "failure");
assert.equal(failureLedger[0].providerRequestCount, 1);
assert.equal(aggregateAiRequestLedgerAccounting(failureLedger).logicalActionCount, 1);
globalThis.fetch = originalFetch;

console.log("Structured output telemetry fixtures passed (cases 1-11 + repair + compatibility).");
