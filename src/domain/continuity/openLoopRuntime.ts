import {
  CONTINUITY_RUNTIME_SCHEMA_VERSION,
  copyContinuityScope,
  sameContinuityScope,
  type ContinuityScope,
} from "./continuityTypes";

export type OpenLoopType = "promise" | "pending_question" | "unfinished_action" | "future_intention" | "unresolved_conflict";
export type OpenLoopStatus = "open" | "pending" | "fulfilled" | "completed" | "cancelled" | "expired" | "superseded";

export interface OpenLoopRecord {
  version: typeof CONTINUITY_RUNTIME_SCHEMA_VERSION;
  id: string;
  scope: ContinuityScope;
  type: OpenLoopType;
  status: OpenLoopStatus;
  description: string;
  createdAt: number;
  updatedAt: number;
  targetTime?: number;
  sourceRefs: readonly string[];
}

export interface CreateOpenLoopInput {
  id: string;
  scope: ContinuityScope;
  type: OpenLoopType;
  description: string;
  createdAt: number;
  targetTime?: number;
  sourceRefs?: readonly string[];
}

const refs = (values: readonly string[] | undefined): string[] => Array.from(new Set(
  (values || []).filter((value): value is string => typeof value === "string")
    .map((value) => value.trim()).filter(Boolean),
)).slice(0, 24);

export function createOpenLoop(input: CreateOpenLoopInput): OpenLoopRecord | undefined {
  if (!input.id.trim() || !input.scope.characterId.trim() || !input.scope.relationId.trim()
    || !input.scope.userIdentityId.trim() || !input.description.trim() || !Number.isFinite(input.createdAt)) return undefined;
  return {
    version: CONTINUITY_RUNTIME_SCHEMA_VERSION,
    id: input.id.trim(),
    scope: copyContinuityScope(input.scope),
    type: input.type,
    status: "open",
    description: input.description.trim().slice(0, 1000),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    ...(input.targetTime !== undefined && Number.isFinite(input.targetTime) ? { targetTime: input.targetTime } : {}),
    sourceRefs: refs(input.sourceRefs),
  };
}

export function upsertOpenLoop(records: readonly OpenLoopRecord[], next: OpenLoopRecord): OpenLoopRecord[] {
  const index = records.findIndex((record) => record.id === next.id && sameContinuityScope(record.scope, next.scope));
  if (index < 0) return [...records, next];
  const result = [...records];
  result[index] = { ...result[index], ...next };
  return result;
}

export function closeOpenLoop(
  records: readonly OpenLoopRecord[],
  scope: ContinuityScope,
  id: string,
  status: Exclude<OpenLoopStatus, "open">,
  at: number,
): OpenLoopRecord[] {
  return records.map((record) => record.id === id && sameContinuityScope(record.scope, scope)
    ? { ...record, status, updatedAt: at }
    : record);
}

export function listOpenLoops(records: readonly OpenLoopRecord[], scope: ContinuityScope): OpenLoopRecord[] {
  return records.filter((record) => sameContinuityScope(record.scope, scope)
    && (record.status === "open" || record.status === "pending"))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export const isOpenLoopPending = (record: Pick<OpenLoopRecord, "status">): boolean =>
  record.status === "open" || record.status === "pending";

/** Explicit lifecycle transition; reloads cannot reopen a fulfilled loop. */
export function transitionOpenLoop(
  records: readonly OpenLoopRecord[],
  scope: ContinuityScope,
  id: string,
  status: Exclude<OpenLoopStatus, "open" | "pending">,
  at: number,
): OpenLoopRecord[] {
  return records.map((record) => record.id === id && sameContinuityScope(record.scope, scope)
    && isOpenLoopPending(record)
    ? { ...record, status, updatedAt: at }
    : record);
}
