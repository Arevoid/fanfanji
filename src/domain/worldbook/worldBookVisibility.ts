import type { WorldBookEntry, WorldBookScope } from "../../types";

export type WorldBookReadScenario = "chat" | "group" | "offline" | "public";

export interface WorldBookReadContext {
  scenario: WorldBookReadScenario;
  characterId?: string;
  userIdentityId?: string;
  relationId?: string;
  /** Direct chat may request every visible entry instead of trigger-only retrieval. */
  includeAllVisibleEntries?: boolean;
}

const isNonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const legacyScope = (entry: WorldBookEntry): WorldBookScope =>
  isNonEmpty(entry.characterId) && entry.characterId !== "global"
    ? { kind: "character", characterId: entry.characterId }
    : { kind: "global" };

export function resolveWorldBookScope(entry: WorldBookEntry): WorldBookScope {
  if (entry.scope?.kind === "global") return entry.scope;
  if (entry.scope?.kind === "character" && isNonEmpty(entry.scope.characterId)) return entry.scope;
  if (entry.scope?.kind === "identity" && isNonEmpty(entry.scope.userIdentityId)) return entry.scope;
  if (entry.scope?.kind === "relationship"
    && isNonEmpty(entry.scope.relationId)
    && isNonEmpty(entry.scope.characterId)
    && isNonEmpty(entry.scope.userIdentityId)) return entry.scope;
  return legacyScope(entry);
}

/** Public visibility is opt-in; legacy entries are never inferred public. */
export function isWorldBookEntryVisible(entry: WorldBookEntry, context: WorldBookReadContext): boolean {
  if (entry.isActive === false) return false;
  const scope = resolveWorldBookScope(entry);
  if (context.scenario === "public") {
    if (entry.visibility !== "public") return false;
    if (entry.purpose && entry.purpose !== "world_canon" && entry.purpose !== "persona_rule") return false;
    return (scope.kind === "global")
      || (scope.kind === "character" && (!context.characterId || scope.characterId === context.characterId));
  }
  if (context.scenario === "group") {
    return (scope.kind === "global")
      || (scope.kind === "character" && (!context.characterId || scope.characterId === context.characterId));
  }
  if (scope.kind === "global") return true;
  if (scope.kind === "character") return !context.characterId || scope.characterId === context.characterId;
  if (scope.kind === "identity") return Boolean(context.userIdentityId && scope.userIdentityId === context.userIdentityId);
  return Boolean(
    context.relationId
    && context.characterId
    && context.userIdentityId
    && scope.relationId === context.relationId
    && scope.characterId === context.characterId
    && scope.userIdentityId === context.userIdentityId,
  );
}
