import type { WorldBookEntry, WorldBookScope } from "../../types";

export type WorldBookReadScenario = "chat" | "group" | "offline" | "public";

export interface WorldBookReadContext {
  scenario: WorldBookReadScenario;
  characterId?: string;
  userIdentityId?: string;
  relationId?: string;
}

const isNonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const normalizedCharacterIds = (values: unknown): string[] => Array.isArray(values)
  ? [...new Set(values.filter(isNonEmpty).map((value) => value.trim()))]
  : [];

const legacyScope = (entry: WorldBookEntry): WorldBookScope =>
  isNonEmpty(entry.characterId) && entry.characterId !== "global"
    ? { kind: "character", characterId: entry.characterId }
    : { kind: "global" };

export function resolveWorldBookScope(entry: WorldBookEntry): WorldBookScope {
  if (entry.scope?.kind === "global") return entry.scope;
  if (entry.scope?.kind === "character" && isNonEmpty(entry.scope.characterId)) return entry.scope;
  if (entry.scope?.kind === "characters") {
    const characterIds = normalizedCharacterIds(entry.scope.characterIds);
    if (characterIds.length > 0) return { kind: "characters", characterIds };
  }
  const characterIds = normalizedCharacterIds(entry.characterIds);
  if (characterIds.length > 0) return { kind: "characters", characterIds };
  if (entry.scope?.kind === "identity" && isNonEmpty(entry.scope.userIdentityId)) return entry.scope;
  if (entry.scope?.kind === "relationship"
    && isNonEmpty(entry.scope.relationId)
    && isNonEmpty(entry.scope.characterId)
    && isNonEmpty(entry.scope.userIdentityId)) return entry.scope;
  return legacyScope(entry);
}

export function getWorldBookCharacterIds(entry: WorldBookEntry): string[] {
  const scope = resolveWorldBookScope(entry);
  if (scope.kind === "character") return [scope.characterId];
  if (scope.kind === "characters") return scope.characterIds;
  if (scope.kind === "relationship") return [scope.characterId];
  return [];
}

export function isWorldBookEntryGlobal(entry: WorldBookEntry): boolean {
  return resolveWorldBookScope(entry).kind === "global";
}

export function isWorldBookEntryForCharacter(entry: WorldBookEntry, characterId: string): boolean {
  const scope = resolveWorldBookScope(entry);
  return scope.kind === "global"
    || (scope.kind === "character" && scope.characterId === characterId)
    || (scope.kind === "characters" && scope.characterIds.includes(characterId))
    || scope.kind === "identity"
    || (scope.kind === "relationship" && scope.characterId === characterId);
}

export function isWorldBookEntryForAnyCharacter(entry: WorldBookEntry, characterIds: Iterable<string>): boolean {
  const scope = resolveWorldBookScope(entry);
  if (scope.kind === "global" || scope.kind === "identity") return true;
  const allowed = new Set(characterIds);
  return getWorldBookCharacterIds(entry).some((characterId) => allowed.has(characterId));
}

/** Public visibility is opt-in; legacy entries are never inferred public. */
export function isWorldBookEntryVisible(entry: WorldBookEntry, context: WorldBookReadContext): boolean {
  if (entry.isActive === false) return false;
  const scope = resolveWorldBookScope(entry);
  if (context.scenario === "public") {
    if (entry.visibility !== "public") return false;
    if (entry.purpose && entry.purpose !== "world_canon" && entry.purpose !== "persona_rule") return false;
    return (scope.kind === "global")
      || (scope.kind === "character" && (!context.characterId || scope.characterId === context.characterId))
      || (scope.kind === "characters" && (!context.characterId || scope.characterIds.includes(context.characterId)));
  }
  if (context.scenario === "group") {
    return (scope.kind === "global")
      || (scope.kind === "character" && (!context.characterId || scope.characterId === context.characterId))
      || (scope.kind === "characters" && (!context.characterId || scope.characterIds.includes(context.characterId)));
  }
  if (scope.kind === "global") return true;
  if (scope.kind === "character") return !context.characterId || scope.characterId === context.characterId;
  if (scope.kind === "characters") return !context.characterId || scope.characterIds.includes(context.characterId);
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
