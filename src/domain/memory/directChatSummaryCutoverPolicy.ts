export type DirectChatSummaryEnqueueKind = "inserted" | "exists" | "no_active_claims" | "unavailable" | "invalid";

export type DirectChatSummaryLifecycleOutcome =
  | "DURABLE_PROJECTION_INSERTED"
  | "DURABLE_PROJECTION_EXISTS"
  | "NO_ACTIVE_CANONICAL_CLAIMS"
  | "DURABLE_PROJECTION_UNAVAILABLE_SYNC_FALLBACK"
  | "SYNC_FALLBACK_SUCCEEDED"
  | "SYNC_FALLBACK_FAILED"
  | "CANONICAL_SNAPSHOT_UNAVAILABLE"
  | "ZERO_CANDIDATES"
  | "MANUAL_SYNCHRONOUS_SUMMARY";

export interface DirectChatSummaryCutoverDecision {
  outcome: DirectChatSummaryLifecycleOutcome;
  writeSynchronousSummary: boolean;
  requiresSynchronousFallback: boolean;
  canAdvanceCursor: boolean;
}

export function resolveDirectChatSummaryCutover(input: {
  automatic: boolean;
  canonicalSnapshotAvailable: boolean;
  zeroCandidates?: boolean;
  enqueueKind?: DirectChatSummaryEnqueueKind;
  fallbackSummaryWritten?: boolean;
}): DirectChatSummaryCutoverDecision {
  if (!input.automatic) {
    return {
      outcome: "MANUAL_SYNCHRONOUS_SUMMARY",
      writeSynchronousSummary: true,
      requiresSynchronousFallback: false,
      canAdvanceCursor: true,
    };
  }
  if (input.zeroCandidates) {
    return {
      outcome: "ZERO_CANDIDATES",
      writeSynchronousSummary: false,
      requiresSynchronousFallback: false,
      canAdvanceCursor: true,
    };
  }
  if (!input.canonicalSnapshotAvailable) {
    return {
      outcome: "CANONICAL_SNAPSHOT_UNAVAILABLE",
      writeSynchronousSummary: false,
      requiresSynchronousFallback: false,
      canAdvanceCursor: false,
    };
  }
  if (input.enqueueKind === "inserted") {
    return {
      outcome: "DURABLE_PROJECTION_INSERTED",
      writeSynchronousSummary: false,
      requiresSynchronousFallback: false,
      canAdvanceCursor: true,
    };
  }
  if (input.enqueueKind === "exists") {
    return {
      outcome: "DURABLE_PROJECTION_EXISTS",
      writeSynchronousSummary: false,
      requiresSynchronousFallback: false,
      canAdvanceCursor: true,
    };
  }
  if (input.enqueueKind === "no_active_claims") {
    return {
      outcome: "NO_ACTIVE_CANONICAL_CLAIMS",
      writeSynchronousSummary: false,
      requiresSynchronousFallback: false,
      canAdvanceCursor: true,
    };
  }
  if (input.fallbackSummaryWritten === true) {
    return {
      outcome: "SYNC_FALLBACK_SUCCEEDED",
      writeSynchronousSummary: true,
      requiresSynchronousFallback: true,
      canAdvanceCursor: true,
    };
  }
  return {
    outcome: input.fallbackSummaryWritten === false ? "SYNC_FALLBACK_FAILED" : "DURABLE_PROJECTION_UNAVAILABLE_SYNC_FALLBACK",
    writeSynchronousSummary: true,
    requiresSynchronousFallback: true,
    canAdvanceCursor: false,
  };
}
