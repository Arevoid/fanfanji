import type { Character, UserIdentity } from "../../types";
import { listRelationshipsForIdentityWorkspace, type CharacterRelationship } from "../../domain/relationship/characterRelationship";
import { isExactTruthScope } from "../../domain/characterKnowledge/knowledgeConflictPolicy";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../../domain/characterKnowledge/characterKnowledgeTypes";
import { loadKnowledgeClaims } from "../storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../storage/repositories/conversationSummaryRepository";
import { deriveCanonicalClaimSetRevision } from "../../domain/memory/memoryCanonicalRevision";
import { reconcileConversationSummaryProjection } from "../../domain/memory/memoryProjectionReconciliation";
import type { MemoryProjectionJob } from "../../domain/memory/memoryProjectionJob";
import { memoryProjectionJobRepository, type MemoryProjectionJobIndexedDbRepository } from "../storage/repositories/memoryProjectionJobRepository";
import type { MemoryProcessingScope } from "../../domain/memory/memorySourceProcessingCursor";

export const MEMORY_PROJECTION_STARTUP_SCOPE_CAP = 20;

type RuntimeRepository = Pick<MemoryProjectionJobIndexedDbRepository, "listByScope" | "insertIfAbsent">;

export interface MemoryProjectionStartupInput {
  relationships: readonly CharacterRelationship[];
  characters: readonly Pick<Character, "id" | "isGroupChat">[];
  activeIdentityId: string;
  identities: readonly UserIdentity[];
  now?: number;
  maxScopes?: number;
  claims?: readonly KnowledgeClaim[];
  summaries?: readonly ConversationSummaryRecord[];
  repository?: RuntimeRepository;
}

export interface MemoryProjectionStartupDiagnostics {
  databaseAvailable: boolean;
  scopesInspected: number;
  noActiveClaims: number;
  current: number;
  alreadyScheduled: number;
  createdJobs: number;
  insertConflicts: number;
  databaseErrors: number;
}

const isDirectScope = (relationship: CharacterRelationship): boolean =>
  Boolean(relationship.conversationId) && !relationship.conversationId.startsWith("group:");

const scopeFromRelationship = (relationship: CharacterRelationship): MemoryProcessingScope => ({
  characterId: relationship.characterId,
  relationId: relationship.id,
  userIdentityId: relationship.userIdentityId,
  conversationId: relationship.conversationId,
});

export function discoverBoundedMemoryProjectionScopes(input: Pick<MemoryProjectionStartupInput, "relationships" | "characters" | "activeIdentityId" | "identities" | "maxScopes">): MemoryProcessingScope[] {
  const loadedCharacterIds = new Set(input.characters.filter((character) => !character.isGroupChat).map((character) => character.id));
  const workspaceRelationships = listRelationshipsForIdentityWorkspace(input.relationships, input.activeIdentityId, input.identities);
  const cap = Math.max(0, Math.floor(input.maxScopes ?? MEMORY_PROJECTION_STARTUP_SCOPE_CAP));
  return workspaceRelationships
    .filter((relationship) => loadedCharacterIds.has(relationship.characterId) && isDirectScope(relationship))
    .sort((left, right) => (right.lastActiveTime ?? right.updatedAt ?? right.createdAt) - (left.lastActiveTime ?? left.updatedAt ?? left.createdAt))
    .slice(0, cap)
    .map(scopeFromRelationship);
}

const matchingSummary = (summaries: readonly ConversationSummaryRecord[], scope: MemoryProcessingScope): ConversationSummaryRecord | undefined =>
  summaries.find((summary) => isExactTruthScope(summary, scope));

export async function reconcileMemoryProjectionJobsOnStartup(input: MemoryProjectionStartupInput): Promise<MemoryProjectionStartupDiagnostics> {
  const diagnostics: MemoryProjectionStartupDiagnostics = {
    databaseAvailable: true,
    scopesInspected: 0,
    noActiveClaims: 0,
    current: 0,
    alreadyScheduled: 0,
    createdJobs: 0,
    insertConflicts: 0,
    databaseErrors: 0,
  };
  const scopes = discoverBoundedMemoryProjectionScopes(input);
  if (scopes.length === 0) return diagnostics;
  const claims = input.claims ?? loadKnowledgeClaims().value;
  const summaries = input.summaries ?? loadConversationSummaries().value;
  const repository = input.repository ?? memoryProjectionJobRepository;
  const now = input.now ?? Date.now();

  for (const scope of scopes) {
    diagnostics.scopesInspected += 1;
    const canonical = { scope, ...deriveCanonicalClaimSetRevision({ scope, claims }) };
    const summary = matchingSummary(summaries, scope);
    const summaryRevision = summary && "canonicalRevision" in summary
      && typeof (summary as ConversationSummaryRecord & { canonicalRevision?: unknown }).canonicalRevision === "string"
      ? (summary as ConversationSummaryRecord & { canonicalRevision: string }).canonicalRevision
      : undefined;
    const planInput = {
      canonical,
      ...(summary ? {
        summary: {
          scope,
          status: summary.status,
          sourceClaimIds: summary.sourceClaimIds,
          ...(summaryRevision ? { canonicalRevision: summaryRevision } : {}),
        },
      } : {}),
      existingJobs: [] as readonly MemoryProjectionJob[],
      now,
    };
    let existingJobs: MemoryProjectionJob[];
    try {
      existingJobs = await repository.listByScope(scope, "conversation_summary");
    } catch {
      diagnostics.databaseAvailable = false;
      diagnostics.databaseErrors += 1;
      break;
    }
    const plan = reconcileConversationSummaryProjection({ ...planInput, existingJobs });
    if (plan.kind === "no_active_claims") { diagnostics.noActiveClaims += 1; continue; }
    if (plan.kind === "current") { diagnostics.current += 1; continue; }
    if (plan.kind === "already_scheduled") { diagnostics.alreadyScheduled += 1; continue; }
    try {
      const inserted = await repository.insertIfAbsent(plan.job);
      if (inserted.kind === "inserted") diagnostics.createdJobs += 1;
      else diagnostics.insertConflicts += 1;
    } catch {
      diagnostics.databaseAvailable = false;
      diagnostics.databaseErrors += 1;
      break;
    }
  }
  return diagnostics;
}
