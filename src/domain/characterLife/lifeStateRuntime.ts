import type { CharacterLifeScope } from "./characterLifeTypes";

export const CHARACTER_LIFE_STATE_SCHEMA_VERSION = 1 as const;

/** Availability is deliberately small and deterministic; it is not a mood. */
export type CharacterAvailability = "available" | "busy" | "offline" | "sleeping" | "unknown";

/** Canonical per-character life state. Scene and relationship remain separate. */
export interface CharacterLifeState extends CharacterLifeScope {
  schemaVersion: typeof CHARACTER_LIFE_STATE_SCHEMA_VERSION;
  currentLifePhase: string;
  currentState?: string;
  currentActivity: string;
  currentLocationSemantic?: string;
  availability: CharacterAvailability;
  lastMeaningfulEventAt?: number;
  lastInteractionAt?: number;
  nextRelevantScheduleAt?: number;
  updatedAt: number;
}

export type CharacterLifeStatePatch = Partial<Pick<
  CharacterLifeState,
  "currentLifePhase" | "currentState" | "currentActivity" | "currentLocationSemantic"
  | "availability" | "lastMeaningfulEventAt" | "lastInteractionAt" | "nextRelevantScheduleAt"
>>;

const AVAILABILITIES = new Set<CharacterAvailability>(["available", "busy", "offline", "sleeping", "unknown"]);

const isFiniteTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isScope = (value: unknown): value is CharacterLifeScope => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<CharacterLifeScope>;
  return [candidate.relationId, candidate.characterId, candidate.userIdentityId]
    .every((entry) => typeof entry === "string" && entry.trim().length > 0);
};

const normalizeText = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : fallback;

const normalizeOptionalText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : undefined;

export const createEmptyCharacterLifeState = (
  scope: CharacterLifeScope,
  now = Date.now(),
): CharacterLifeState => ({
  relationId: scope.relationId.trim(),
  characterId: scope.characterId.trim(),
  userIdentityId: scope.userIdentityId.trim(),
  schemaVersion: CHARACTER_LIFE_STATE_SCHEMA_VERSION,
  currentLifePhase: "unknown",
  currentState: "unknown",
  currentActivity: "unknown",
  availability: "unknown",
  updatedAt: isFiniteTimestamp(now) ? now : Date.now(),
});

/** Invalid/legacy records fail closed to an empty state without destructive migration. */
export const normalizeCharacterLifeState = (value: unknown): CharacterLifeState | undefined => {
  if (!isScope(value) || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<CharacterLifeState>;
  if (candidate.schemaVersion !== undefined && candidate.schemaVersion !== CHARACTER_LIFE_STATE_SCHEMA_VERSION) return undefined;
  if (!isFiniteTimestamp(candidate.updatedAt)) return undefined;
  const availability = AVAILABILITIES.has(candidate.availability as CharacterAvailability)
    ? candidate.availability as CharacterAvailability
    : "unknown";
  return {
    relationId: candidate.relationId!.trim(),
    characterId: candidate.characterId!.trim(),
    userIdentityId: candidate.userIdentityId!.trim(),
    schemaVersion: CHARACTER_LIFE_STATE_SCHEMA_VERSION,
    currentLifePhase: normalizeText(candidate.currentLifePhase, "unknown"),
    ...(normalizeOptionalText(candidate.currentState) ? { currentState: normalizeOptionalText(candidate.currentState) } : {}),
    currentActivity: normalizeText(candidate.currentActivity, "unknown"),
    ...(normalizeOptionalText(candidate.currentLocationSemantic)
      ? { currentLocationSemantic: normalizeOptionalText(candidate.currentLocationSemantic) }
      : {}),
    availability,
    ...(isFiniteTimestamp(candidate.lastMeaningfulEventAt) ? { lastMeaningfulEventAt: candidate.lastMeaningfulEventAt } : {}),
    ...(isFiniteTimestamp(candidate.lastInteractionAt) ? { lastInteractionAt: candidate.lastInteractionAt } : {}),
    ...(isFiniteTimestamp(candidate.nextRelevantScheduleAt) ? { nextRelevantScheduleAt: candidate.nextRelevantScheduleAt } : {}),
    updatedAt: candidate.updatedAt,
  };
};

const sameScope = (left: CharacterLifeScope, right: CharacterLifeScope): boolean =>
  left.relationId === right.relationId
  && left.characterId === right.characterId
  && left.userIdentityId === right.userIdentityId;

/** Applies an explicit deterministic patch and never crosses relation scope. */
export const applyCharacterLifeStatePatch = (
  previous: CharacterLifeState | undefined,
  scope: CharacterLifeScope,
  patch: CharacterLifeStatePatch,
  now = Date.now(),
): CharacterLifeState => {
  const base = previous && sameScope(previous, scope) ? previous : createEmptyCharacterLifeState(scope, now);
  const next: CharacterLifeState = {
    ...base,
    ...(patch.currentLifePhase?.trim() ? { currentLifePhase: patch.currentLifePhase.trim().slice(0, 240) } : {}),
    ...(patch.currentState?.trim() ? { currentState: patch.currentState.trim().slice(0, 240) } : {}),
    ...(patch.currentActivity?.trim() ? { currentActivity: patch.currentActivity.trim().slice(0, 240) } : {}),
    ...(patch.currentLocationSemantic?.trim() ? { currentLocationSemantic: patch.currentLocationSemantic.trim().slice(0, 240) } : {}),
    ...(patch.availability && AVAILABILITIES.has(patch.availability) ? { availability: patch.availability } : {}),
    ...(isFiniteTimestamp(patch.lastMeaningfulEventAt) ? { lastMeaningfulEventAt: patch.lastMeaningfulEventAt } : {}),
    ...(isFiniteTimestamp(patch.lastInteractionAt) ? { lastInteractionAt: patch.lastInteractionAt } : {}),
    ...(isFiniteTimestamp(patch.nextRelevantScheduleAt) ? { nextRelevantScheduleAt: patch.nextRelevantScheduleAt } : {}),
    updatedAt: isFiniteTimestamp(now) ? now : base.updatedAt,
  };
  return next;
};

export const isCharacterLifeState = (value: unknown): value is CharacterLifeState =>
  normalizeCharacterLifeState(value) !== undefined;

export const isSameCharacterLifeScope = sameScope;
