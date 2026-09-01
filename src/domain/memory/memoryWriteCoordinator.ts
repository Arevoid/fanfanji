import type { MemoryItem } from "../../types";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";

/**
 * The storage layer intentionally exposes only the part of a write result that
 * the memory domain needs. Keeping the port small lets chat, offline mode and
 * the memory UI share the same commit rules without importing repositories into
 * the domain model.
 */
export interface MemoryWriteResultLike {
  success: boolean;
  error?: unknown;
}

export type MemoryWriteCallback<T> = (
  value: readonly T[],
) => MemoryWriteResultLike | boolean | void | Promise<MemoryWriteResultLike | boolean | void>;

export interface MemoryWriteBundleInput {
  claims?: readonly KnowledgeClaim[];
  summary?: ConversationSummaryRecord;
  summaries?: readonly ConversationSummaryRecord[];
  /** A complete, already-merged compatibility snapshot. */
  memories?: readonly MemoryItem[];
  /** Specialized canonical operation such as supersede/retract. */
  writeClaims?: MemoryWriteCallback<KnowledgeClaim>;
  appendClaims?: MemoryWriteCallback<KnowledgeClaim>;
  appendSummaries?: MemoryWriteCallback<ConversationSummaryRecord>;
  saveMemories?: MemoryWriteCallback<MemoryItem>;
}

export interface MemoryWriteBundleResult {
  /** Canonical claims are the source of truth and are always committed first. */
  canonicalWritten: boolean;
  summaryWritten: boolean;
  memoriesWritten: boolean;
  complete: boolean;
  error?: unknown;
  summaryError?: unknown;
  memoriesError?: unknown;
}

const didWrite = (result: MemoryWriteResultLike | boolean | void): boolean => {
  if (result === false) return false;
  if (typeof result === "object" && result !== null && "success" in result) {
    return result.success === true;
  }
  return true;
};

const getWriteError = (result: MemoryWriteResultLike | boolean | void): unknown =>
  typeof result === "object" && result !== null && "error" in result ? result.error : undefined;

/**
 * Commits one memory bundle in a stable order:
 *
 * 1. write canonical claims;
 * 2. write the rebuildable conversation-summary projection;
 * 3. write the legacy MemoryItem compatibility projection.
 *
 * Derived records are never written when the canonical write fails. The
 * repository callbacks are expected to be idempotent (claim/summary
 * repositories already deduplicate by id), so retrying a failed later step
 * cannot create a second copy or erase the previous snapshot.
 */
export async function commitMemoryWriteBundle(
  input: MemoryWriteBundleInput,
): Promise<MemoryWriteBundleResult> {
  const claims = input.claims || [];
  const summaries = [
    ...(input.summary ? [input.summary] : []),
    ...(input.summaries || []),
  ];

  if (claims.length > 0) {
    const writeClaims = input.writeClaims || input.appendClaims;
    if (!writeClaims) {
      return {
        canonicalWritten: false,
        summaryWritten: false,
        memoriesWritten: false,
        complete: false,
        error: "canonical_claim_writer_missing",
      };
    }
    try {
      const result = await writeClaims(claims);
      if (!didWrite(result)) {
        return {
          canonicalWritten: false,
          summaryWritten: false,
          memoriesWritten: false,
          complete: false,
          error: getWriteError(result) || "canonical_claim_write_failed",
        };
      }
    } catch (error) {
      return {
        canonicalWritten: false,
        summaryWritten: false,
        memoriesWritten: false,
        complete: false,
        error,
      };
    }
  }

  const canonicalWritten = true;
  let summaryWritten = summaries.length === 0;
  let summaryError: unknown;
  if (summaries.length > 0) {
    if (!input.appendSummaries) {
      summaryError = "summary_writer_missing";
    } else {
      try {
        const result = await input.appendSummaries(summaries);
        summaryWritten = didWrite(result);
        if (!summaryWritten) summaryError = getWriteError(result) || "summary_write_failed";
      } catch (error) {
        summaryError = error;
      }
    }
  }

  let memoriesWritten = !input.memories;
  let memoriesError: unknown;
  if (input.memories) {
    if (!input.saveMemories) {
      memoriesError = "compatibility_memory_writer_missing";
    } else {
      try {
        const result = await input.saveMemories(input.memories);
        memoriesWritten = didWrite(result);
        if (!memoriesWritten) memoriesError = getWriteError(result) || "compatibility_memory_write_failed";
      } catch (error) {
        memoriesError = error;
      }
    }
  }

  return {
    canonicalWritten,
    summaryWritten,
    memoriesWritten,
    complete: canonicalWritten && summaryWritten && memoriesWritten,
    ...(summaryError !== undefined ? { summaryError } : {}),
    ...(memoriesError !== undefined ? { memoriesError } : {}),
  };
}
