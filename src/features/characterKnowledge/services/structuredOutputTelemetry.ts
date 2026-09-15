/**
 * Privacy-safe, bounded diagnostics for structured memory extraction.
 *
 * This module intentionally contains only enums, buckets and counters.  It
 * must never receive or persist prompt text, message bodies, provider bodies,
 * credentials or headers.
 */

export type StructuredOutputProtocolFamily =
  | "openai_compatible"
  | "gemini_native"
  | "unknown";

export type StructuredOutputEnvelopeKind =
  | "openai_choices"
  | "gemini_candidates"
  | "unknown";

export type StructuredOutputContentKind =
  | "string"
  | "text_parts"
  | "mixed_parts"
  | "missing"
  | "unknown";

export type StructuredOutputWrapperKind =
  | "plain_json"
  | "json_fence"
  | "jsonl_fence"
  | "prose_wrapper"
  | "unknown";

export type StructuredOutputJsonRootKind = "object" | "array" | "scalar" | "none";

export type StructuredOutputFinishReasonKind =
  | "stop"
  | "length"
  | "content_filter"
  | "tool_call"
  | "other"
  | "missing"
  | "unknown";

export type StructuredOutputParseStage = "json" | "jsonl" | "none" | "unknown";

export type StructuredOutputFailureStage =
  | "none"
  | "envelope"
  | "content"
  | "wrapper"
  | "json_parse"
  | "jsonl_parse"
  | "schema"
  | "candidate_normalization"
  | "unknown";

export type StructuredOutputFailureReasonCode =
  | "none"
  | "transport_error"
  | "http_error"
  | "unsupported_envelope"
  | "missing_content"
  | "empty_content"
  | "prose_wrapper"
  | "json_parse_failed"
  | "truncated_json"
  | "jsonl_no_valid_entries"
  | "schema_rejected"
  | "valid_empty"
  | "unknown";

export type StructuredOutputSchemaRejectReasonCode =
  | "none"
  | "not_object"
  | "missing_statement"
  | "invalid_kind"
  | "invalid_subject"
  | "invalid_temporal_status"
  | "missing_source_refs"
  | "invalid_source_refs"
  | "missing_evidence_quote"
  | "unknown";

export type StructuredOutputFallbackReasonCode =
  | "none"
  | "repair_request"
  | "model_fallback"
  | "unknown";

export type StructuredOutputTextLengthBucket = "0" | "1-256" | "257-1024" | "1025-4096" | "4097+";

export interface StructuredOutputTelemetry {
  protocolFamily: StructuredOutputProtocolFamily;
  transportOk: boolean;
  responseEnvelopeKind: StructuredOutputEnvelopeKind;
  choiceCount: number;
  messageContentKind: StructuredOutputContentKind;
  contentPartCount: number;
  textPresent: boolean;
  textLengthBucket: StructuredOutputTextLengthBucket;
  finishReasonKind: StructuredOutputFinishReasonKind;
  wrapperKind: StructuredOutputWrapperKind;
  jsonParseStage: StructuredOutputParseStage;
  jsonParseSucceeded: boolean;
  jsonRootKind: StructuredOutputJsonRootKind;
  jsonlAttempted: boolean;
  jsonlAcceptedCount: number;
  jsonlRejectedCount: number;
  structuredEntryCount: number;
  legacyCandidateRawCount: number;
  legacyCandidateAcceptedCount: number;
  legacyCandidateRejectedCount: number;
  v2CandidateRawCount: number;
  v2CandidateAcceptedCount: number;
  v2CandidateRejectedCount: number;
  schemaRejectReasonCode: StructuredOutputSchemaRejectReasonCode;
  finalCandidateCount: number;
  fallbackAttempted: boolean;
  fallbackReasonCode: StructuredOutputFallbackReasonCode;
  failureStage: StructuredOutputFailureStage;
  failureReasonCode: StructuredOutputFailureReasonCode;
}

export const textLengthBucket = (length: number): StructuredOutputTextLengthBucket => {
  const value = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
  if (value === 0) return "0";
  if (value <= 256) return "1-256";
  if (value <= 1024) return "257-1024";
  if (value <= 4096) return "1025-4096";
  return "4097+";
};

export const emptyStructuredOutputTelemetry = (
  overrides: Partial<StructuredOutputTelemetry> = {},
): StructuredOutputTelemetry => ({
  protocolFamily: "unknown",
  transportOk: false,
  responseEnvelopeKind: "unknown",
  choiceCount: 0,
  messageContentKind: "missing",
  contentPartCount: 0,
  textPresent: false,
  textLengthBucket: "0",
  finishReasonKind: "missing",
  wrapperKind: "unknown",
  jsonParseStage: "none",
  jsonParseSucceeded: false,
  jsonRootKind: "none",
  jsonlAttempted: false,
  jsonlAcceptedCount: 0,
  jsonlRejectedCount: 0,
  structuredEntryCount: 0,
  legacyCandidateRawCount: 0,
  legacyCandidateAcceptedCount: 0,
  legacyCandidateRejectedCount: 0,
  v2CandidateRawCount: 0,
  v2CandidateAcceptedCount: 0,
  v2CandidateRejectedCount: 0,
  schemaRejectReasonCode: "none",
  finalCandidateCount: 0,
  fallbackAttempted: false,
  fallbackReasonCode: "none",
  failureStage: "unknown",
  failureReasonCode: "unknown",
  ...overrides,
});

export const withStructuredOutputTelemetry = (
  base: StructuredOutputTelemetry | undefined,
  patch: Partial<StructuredOutputTelemetry>,
): StructuredOutputTelemetry => emptyStructuredOutputTelemetry({ ...(base || {}), ...patch });

/** Merge transport-level and parser-level diagnostics without letting parser
 * defaults overwrite the adapter's protocol/envelope observations. */
export const combineStructuredOutputTelemetry = (
  transport: StructuredOutputTelemetry,
  parser: StructuredOutputTelemetry,
): StructuredOutputTelemetry => emptyStructuredOutputTelemetry({
  ...parser,
  protocolFamily: transport.protocolFamily,
  transportOk: transport.transportOk,
  responseEnvelopeKind: transport.responseEnvelopeKind,
  choiceCount: transport.choiceCount,
  messageContentKind: transport.messageContentKind,
  contentPartCount: transport.contentPartCount,
  textPresent: transport.textPresent,
  textLengthBucket: transport.textLengthBucket,
  finishReasonKind: transport.finishReasonKind,
  fallbackAttempted: parser.fallbackAttempted || transport.fallbackAttempted,
  fallbackReasonCode: parser.fallbackAttempted ? parser.fallbackReasonCode : transport.fallbackReasonCode,
});

const enumValues = {
  protocolFamily: new Set(["openai_compatible", "gemini_native", "unknown"]),
  responseEnvelopeKind: new Set(["openai_choices", "gemini_candidates", "unknown"]),
  messageContentKind: new Set(["string", "text_parts", "mixed_parts", "missing", "unknown"]),
  wrapperKind: new Set(["plain_json", "json_fence", "jsonl_fence", "prose_wrapper", "unknown"]),
  jsonParseStage: new Set(["json", "jsonl", "none", "unknown"]),
  jsonRootKind: new Set(["object", "array", "scalar", "none"]),
  finishReasonKind: new Set(["stop", "length", "content_filter", "tool_call", "other", "missing", "unknown"]),
  schemaRejectReasonCode: new Set(["none", "not_object", "missing_statement", "invalid_kind", "invalid_subject", "invalid_temporal_status", "missing_source_refs", "invalid_source_refs", "missing_evidence_quote", "unknown"]),
  fallbackReasonCode: new Set(["none", "repair_request", "model_fallback", "unknown"]),
  failureStage: new Set(["none", "envelope", "content", "wrapper", "json_parse", "jsonl_parse", "schema", "candidate_normalization", "unknown"]),
  failureReasonCode: new Set(["none", "transport_error", "http_error", "unsupported_envelope", "missing_content", "empty_content", "prose_wrapper", "json_parse_failed", "truncated_json", "jsonl_no_valid_entries", "schema_rejected", "valid_empty", "unknown"]),
} as const;

const boundedCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 4096;

/** Validate the additive DTO before it crosses the client boundary. */
export const isStructuredOutputTelemetry = (value: unknown): value is StructuredOutputTelemetry => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.transportOk !== "boolean" || typeof candidate.textPresent !== "boolean"
    || typeof candidate.jsonParseSucceeded !== "boolean" || typeof candidate.jsonlAttempted !== "boolean"
    || typeof candidate.fallbackAttempted !== "boolean") return false;
  for (const key of Object.keys(enumValues) as (keyof typeof enumValues)[]) {
    if (typeof candidate[key] !== "string" || !enumValues[key].has(candidate[key] as never)) return false;
  }
  const bucketValues = new Set(["0", "1-256", "257-1024", "1025-4096", "4097+"]);
  if (typeof candidate.textLengthBucket !== "string" || !bucketValues.has(candidate.textLengthBucket)) return false;
  return ["choiceCount", "contentPartCount", "jsonlAcceptedCount", "jsonlRejectedCount", "structuredEntryCount",
    "legacyCandidateRawCount", "legacyCandidateAcceptedCount", "legacyCandidateRejectedCount", "v2CandidateRawCount",
    "v2CandidateAcceptedCount", "v2CandidateRejectedCount", "finalCandidateCount"].every((key) => boundedCount(candidate[key]));
};
