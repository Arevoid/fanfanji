import type { KnowledgeClaim } from "../../domain/characterKnowledge/characterKnowledgeTypes";
import type { MemoryProcessingScope } from "../../domain/memory/memorySourceProcessingCursor";
import { deriveCanonicalClaimSetRevision } from "../../domain/memory/memoryCanonicalRevision";
import { createMemoryProjectionJob, type MemoryProjectionJob } from "../../domain/memory/memoryProjectionJob";
import { loadKnowledgeClaims } from "../storage/repositories/characterKnowledgeRepository";
import {
  memoryProjectionJobRepository,
  type MemoryProjectionJobIndexedDbRepository,
} from "../storage/repositories/memoryProjectionJobRepository";
import { scheduleMemoryProjectionDrain } from "./memoryProjectionDrainScheduler";

type EnqueueRepository = Pick<MemoryProjectionJobIndexedDbRepository, "insertIfAbsent">;

export type MemoryProjectionEnqueueResult =
  | { kind: "inserted"; job: MemoryProjectionJob }
  | { kind: "exists"; job: MemoryProjectionJob }
  | { kind: "no_active_claims" }
  | { kind: "unavailable"; error?: unknown }
  | { kind: "invalid" };

export interface EnqueueConversationSummaryProjectionInput {
  scope: MemoryProcessingScope;
  /** Must be the final canonical repository snapshot after append succeeds. */
  claims?: readonly KnowledgeClaim[];
  canonicalStateResolved?: boolean;
  now?: number;
  repository?: EnqueueRepository;
  scheduleDrain?: () => boolean | void;
}

/**
 * Creates the deterministic durable job for the final canonical claim state.
 * This service never reads transcript data and fails open when local storage or
 * IndexedDB is unavailable.
 */
export async function enqueueConversationSummaryProjection(
  input: EnqueueConversationSummaryProjectionInput,
): Promise<MemoryProjectionEnqueueResult> {
  let claims = input.claims;
  if (!claims && input.canonicalStateResolved !== false) {
    const loaded = loadKnowledgeClaims();
    if (!loaded.valid) return { kind: "unavailable", error: loaded.error };
    claims = loaded.value;
  }
  if (input.canonicalStateResolved === false || !claims) return { kind: "unavailable", error: "canonical_state_unavailable" };
  const canonical = deriveCanonicalClaimSetRevision({ scope: input.scope, claims });
  if (canonical.activeClaimIds.length === 0) return { kind: "no_active_claims" };
  const job = createMemoryProjectionJob({
    projectionKind: "conversation_summary",
    scope: input.scope,
    canonicalRefs: canonical.activeClaimIds,
    canonicalRevision: canonical.revision,
    createdAt: input.now ?? Date.now(),
  });
  try {
    const result = await (input.repository || memoryProjectionJobRepository).insertIfAbsent(job);
    if (result.kind === "inserted") {
      (input.scheduleDrain || scheduleMemoryProjectionDrain)();
      return { kind: "inserted", job: result.job };
    }
    (input.scheduleDrain || scheduleMemoryProjectionDrain)();
    return { kind: "exists", job: result.job };
  } catch (error) {
    console.warn("[memory-projection] Durable enqueue unavailable; startup reconciliation remains the recovery path.", error);
    return { kind: "unavailable", error };
  }
}
