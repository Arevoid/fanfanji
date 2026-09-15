/** Type-only boundary for privacy-safe structured-output telemetry. */
export interface StructuredOutputTelemetry {
  protocolFamily: "openai_compatible" | "gemini_native" | "unknown";
  transportOk: boolean;
  responseEnvelopeKind: "openai_choices" | "gemini_candidates" | "unknown";
  choiceCount: number;
  messageContentKind: "string" | "text_parts" | "mixed_parts" | "missing" | "unknown";
  contentPartCount: number;
  textPresent: boolean;
  textLengthBucket: "0" | "1-256" | "257-1024" | "1025-4096" | "4097+";
  finishReasonKind: "stop" | "length" | "content_filter" | "tool_call" | "other" | "missing" | "unknown";
  wrapperKind: "plain_json" | "json_fence" | "jsonl_fence" | "prose_wrapper" | "unknown";
  jsonParseStage: "json" | "jsonl" | "none" | "unknown";
  jsonParseSucceeded: boolean;
  jsonRootKind: "object" | "array" | "scalar" | "none";
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
  schemaRejectReasonCode: "none" | "not_object" | "missing_statement" | "invalid_kind" | "invalid_subject" | "invalid_temporal_status" | "missing_source_refs" | "invalid_source_refs" | "missing_evidence_quote" | "unknown";
  finalCandidateCount: number;
  fallbackAttempted: boolean;
  fallbackReasonCode: "none" | "repair_request" | "model_fallback" | "unknown";
  failureStage: "none" | "envelope" | "content" | "wrapper" | "json_parse" | "jsonl_parse" | "schema" | "candidate_normalization" | "unknown";
  failureReasonCode: "none" | "transport_error" | "http_error" | "unsupported_envelope" | "missing_content" | "empty_content" | "prose_wrapper" | "json_parse_failed" | "truncated_json" | "jsonl_no_valid_entries" | "schema_rejected" | "valid_empty" | "unknown";
}
