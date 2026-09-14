import {
  CONTINUITY_RUNTIME_SCHEMA_VERSION,
  copyContinuityScope,
  sameContinuityScope,
  type ContinuityScope,
} from "./continuityTypes";

export type BeliefSubjectScope = "user" | "character" | "relationship" | "other";

export interface BeliefRecord {
  version: typeof CONTINUITY_RUNTIME_SCHEMA_VERSION;
  id: string;
  scope: ContinuityScope;
  subjectScope: BeliefSubjectScope;
  proposition: string;
  category: string;
  confidence: number;
  supportingEventRefs: readonly string[];
  updatedAt: number;
  decayMs?: number;
  stability?: number;
}

export interface UpsertBeliefInput {
  id: string;
  scope: ContinuityScope;
  subjectScope: BeliefSubjectScope;
  proposition: string;
  category?: string;
  confidence: number;
  supportingEventRefs?: readonly string[];
  updatedAt: number;
  decayMs?: number;
  stability?: number;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const refs = (values: readonly string[] | undefined): string[] => Array.from(new Set(
  (values || []).filter((value): value is string => typeof value === "string")
    .map((value) => value.trim()).filter(Boolean),
)).slice(0, 24);

/** A subjective impression channel; it is never an objective Truth writer. */
export function createBeliefRecord(input: UpsertBeliefInput): BeliefRecord | undefined {
  if (!input.id.trim() || !input.scope.characterId.trim() || !input.scope.relationId.trim()
    || !input.scope.userIdentityId.trim() || !input.proposition.trim() || !Number.isFinite(input.updatedAt)) return undefined;
  return {
    version: CONTINUITY_RUNTIME_SCHEMA_VERSION,
    id: input.id.trim(),
    scope: copyContinuityScope(input.scope),
    subjectScope: input.subjectScope,
    proposition: input.proposition.trim().slice(0, 1000),
    category: input.category?.trim() || "impression",
    confidence: clamp(input.confidence),
    supportingEventRefs: refs(input.supportingEventRefs),
    updatedAt: input.updatedAt,
    ...(input.decayMs !== undefined && Number.isFinite(input.decayMs) ? { decayMs: Math.max(0, input.decayMs) } : {}),
    ...(input.stability !== undefined && Number.isFinite(input.stability) ? { stability: clamp(input.stability) } : {}),
  };
}

/** Upserts only inside the exact character/relation/identity scope. */
export function upsertBelief(records: readonly BeliefRecord[], input: UpsertBeliefInput): BeliefRecord[] {
  const next = createBeliefRecord(input);
  if (!next) return [...records];
  const key = `${next.scope.characterId}\u0000${next.scope.relationId}\u0000${next.scope.userIdentityId}\u0000${next.subjectScope}\u0000${next.proposition.toLocaleLowerCase()}`;
  const index = records.findIndex((record) => `${record.scope.characterId}\u0000${record.scope.relationId}\u0000${record.scope.userIdentityId}\u0000${record.subjectScope}\u0000${record.proposition.toLocaleLowerCase()}` === key);
  if (index < 0) return [...records, next];
  const result = [...records];
  result[index] = { ...result[index], ...next, id: result[index].id };
  return result;
}

export function listBeliefsForScope(records: readonly BeliefRecord[], scope: ContinuityScope): BeliefRecord[] {
  return records.filter((record) => sameContinuityScope(record.scope, scope)).sort((left, right) => right.updatedAt - left.updatedAt);
}
