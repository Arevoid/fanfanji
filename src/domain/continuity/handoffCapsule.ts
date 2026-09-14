import {
  CONTINUITY_RUNTIME_SCHEMA_VERSION,
  copyContinuityScope,
  isContinuityScope,
  type ContinuityScene,
  type ContinuityScope,
} from "./continuityTypes";

export interface HandoffCapsule {
  version: typeof CONTINUITY_RUNTIME_SCHEMA_VERSION;
  id: string;
  scope: ContinuityScope;
  previousScene: ContinuityScene;
  exitTimestamp: number;
  recentInteractionSummary?: string;
  recentInteractionRefs: readonly string[];
  unresolvedTopicRefs: readonly string[];
  recentMeaningfulEventRefs: readonly string[];
  relationshipContinuityRef?: string;
  createdAt: number;
}

export interface CreateHandoffCapsuleInput {
  id: string;
  scope: ContinuityScope;
  previousScene: ContinuityScene;
  exitTimestamp: number;
  recentInteractionSummary?: string;
  recentInteractionRefs?: readonly string[];
  unresolvedTopicRefs?: readonly string[];
  recentMeaningfulEventRefs?: readonly string[];
  relationshipContinuityRef?: string;
  createdAt?: number;
}

const SCENES = new Set<ContinuityScene>([
  "online_chat",
  "offline_story",
  "imagined_scene",
  "memory_recall",
]);
const MAX_REFERENCE_COUNT = 32;
const MAX_SUMMARY_LENGTH = 1200;

const boundedRefs = (values: readonly string[] | undefined): string[] => Array.from(new Set(
  (values || [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean),
)).slice(0, MAX_REFERENCE_COUNT);

/**
 * Builds an intentionally small Online↔Offline bridge. It carries references
 * and a bounded summary only; it never copies a transcript, prompt or Memory
 * dump into the continuity state.
 */
export function createHandoffCapsule(input: CreateHandoffCapsuleInput): HandoffCapsule | undefined {
  if (!input.id.trim() || !input.scope.characterId.trim() || !input.scope.relationId.trim()
    || !input.scope.userIdentityId.trim() || !SCENES.has(input.previousScene)
    || !Number.isFinite(input.exitTimestamp) || input.exitTimestamp < 0) return undefined;
  const createdAt = input.createdAt ?? input.exitTimestamp;
  if (!Number.isFinite(createdAt) || createdAt < 0) return undefined;
  const summary = input.recentInteractionSummary?.trim().slice(0, MAX_SUMMARY_LENGTH);
  return {
    version: CONTINUITY_RUNTIME_SCHEMA_VERSION,
    id: input.id.trim(),
    scope: copyContinuityScope(input.scope),
    previousScene: input.previousScene,
    exitTimestamp: input.exitTimestamp,
    ...(summary ? { recentInteractionSummary: summary } : {}),
    recentInteractionRefs: boundedRefs(input.recentInteractionRefs),
    unresolvedTopicRefs: boundedRefs(input.unresolvedTopicRefs),
    recentMeaningfulEventRefs: boundedRefs(input.recentMeaningfulEventRefs),
    ...(input.relationshipContinuityRef?.trim()
      ? { relationshipContinuityRef: input.relationshipContinuityRef.trim() }
      : {}),
    createdAt,
  };
}

/** Alias used by callers that already have a prepared handoff input. */
export const buildHandoffCapsule = createHandoffCapsule;

export const isHandoffCapsule = (value: unknown): value is HandoffCapsule => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<HandoffCapsule>;
  return candidate.version === CONTINUITY_RUNTIME_SCHEMA_VERSION
    && typeof candidate.id === "string"
    && typeof candidate.exitTimestamp === "number"
    && SCENES.has(candidate.previousScene as ContinuityScene)
    && Array.isArray(candidate.recentInteractionRefs)
    && Array.isArray(candidate.unresolvedTopicRefs)
    && Array.isArray(candidate.recentMeaningfulEventRefs)
    && isContinuityScope(candidate.scope);
};
