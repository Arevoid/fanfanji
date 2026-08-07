import type {
  ForumStory,
  StoryEvent,
  StoryUpdate,
} from "./forumStoryTypes";

/** The narrative phase currently reached by one ForumStory. */
export type NarrativeStage =
  | "opening"
  | "developing"
  | "climax"
  | "ending"
  | "completed";

/** Actions that a caller may consider at the current narrative phase. */
export type ForumStoryNarrativeAction =
  | "generate_comment"
  | "generate_update"
  | "generate_major_update"
  | "complete_story";

export interface ForumStoryNarrativePolicyOptions {
  /** Minimum non-rejected events required to reach the climax. */
  readonly climaxEventCount?: number;
  /** Minimum published updates required to reach the climax. */
  readonly climaxUpdateCount?: number;
  /** Minimum non-rejected events required to reach the ending. */
  readonly endingEventCount?: number;
  /** Minimum published updates required to reach the ending. */
  readonly endingUpdateCount?: number;
  /** Elapsed time after which an active story can enter development. */
  readonly developingDurationMs?: number;
  /** Elapsed time after which an active story can enter the climax. */
  readonly climaxDurationMs?: number;
  /** Elapsed time after which an active story can enter the ending. */
  readonly endingDurationMs?: number;
}

export interface ForumStoryNarrativeInput {
  readonly story?: ForumStory | null;
  readonly events: readonly StoryEvent[];
  readonly updates: readonly StoryUpdate[];
  /**
   * Current story time. When omitted, the latest supplied story-scope
   * activity (or story.updatedAt) is used, keeping the policy deterministic.
   */
  readonly now?: number;
  readonly policy?: ForumStoryNarrativePolicyOptions;
}

export interface ForumStoryNarrativeDecision {
  readonly stage: NarrativeStage;
  readonly allowedActions: readonly ForumStoryNarrativeAction[];
}

export const DEFAULT_FORUM_STORY_NARRATIVE_POLICY: Required<ForumStoryNarrativePolicyOptions> = {
  climaxEventCount: 6,
  climaxUpdateCount: 3,
  endingEventCount: 10,
  endingUpdateCount: 5,
  developingDurationMs: 24 * 60 * 60 * 1000,
  climaxDurationMs: 3 * 24 * 60 * 60 * 1000,
  endingDurationMs: 7 * 24 * 60 * 60 * 1000,
};

const ACTIONS_BY_STAGE: Record<NarrativeStage, readonly ForumStoryNarrativeAction[]> = {
  opening: ["generate_comment", "generate_update"],
  developing: ["generate_comment", "generate_update"],
  climax: ["generate_major_update"],
  ending: ["complete_story"],
  completed: [],
};

const isFiniteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

const hasValidPolicy = (policy: Required<ForumStoryNarrativePolicyOptions>): boolean =>
  Number.isInteger(policy.climaxEventCount)
    && policy.climaxEventCount > 0
    && Number.isInteger(policy.climaxUpdateCount)
    && policy.climaxUpdateCount > 0
    && Number.isInteger(policy.endingEventCount)
    && policy.endingEventCount >= policy.climaxEventCount
    && Number.isInteger(policy.endingUpdateCount)
    && policy.endingUpdateCount >= policy.climaxUpdateCount
    && isFiniteNonNegative(policy.developingDurationMs)
    && policy.climaxDurationMs >= policy.developingDurationMs
    && policy.endingDurationMs >= policy.climaxDurationMs;

const latestActivityAt = (
  story: ForumStory,
  events: readonly StoryEvent[],
  updates: readonly StoryUpdate[],
): number => events.reduce(
  (latest, event) => Math.max(latest, event.occurredAt),
  updates.reduce((latest, update) => Math.max(latest, update.updatedAt), story.updatedAt),
);

const actionsFor = (stage: NarrativeStage): readonly ForumStoryNarrativeAction[] => [
  ...ACTIONS_BY_STAGE[stage],
];

const decisionFor = (stage: NarrativeStage): ForumStoryNarrativeDecision => ({
  stage,
  allowedActions: actionsFor(stage),
});

/**
 * Pure narrative phase decision for one story.
 *
 * Only records carrying the supplied story ID are considered. Foreign events
 * and updates are ignored rather than allowed to influence this story. The
 * function does not read storage, call AI, or mutate any supplied value.
 */
export const evaluateForumStoryNarrative = (
  input: ForumStoryNarrativeInput,
): ForumStoryNarrativeDecision => {
  const story = input.story;
  if (!story) return decisionFor("opening");
  if (story.status === "completed") return decisionFor("completed");

  const policy = {
    ...DEFAULT_FORUM_STORY_NARRATIVE_POLICY,
    ...input.policy,
  };
  if (!hasValidPolicy(policy)) return decisionFor("opening");

  const storyEvents = input.events.filter(
    (event) => event.storyId === story.id && event.status === "confirmed",
  );
  const storyUpdates = input.updates.filter(
    (update) => update.storyId === story.id && update.status === "published",
  );
  const eventCount = storyEvents.length;
  const updateCount = storyUpdates.length;
  const latestActivity = latestActivityAt(story, storyEvents, storyUpdates);
  const currentTime = input.now ?? latestActivity;
  const elapsed = Number.isFinite(currentTime)
    ? Math.max(0, currentTime - story.createdAt)
    : 0;
  const hasActivity = eventCount > 0 || updateCount > 0;

  if (story.status === "draft" || !hasActivity) return decisionFor("opening");

  if (
    eventCount >= policy.endingEventCount
    || updateCount >= policy.endingUpdateCount
    || elapsed >= policy.endingDurationMs
  ) {
    return decisionFor("ending");
  }

  if (
    eventCount >= policy.climaxEventCount
    || updateCount >= policy.climaxUpdateCount
    || elapsed >= policy.climaxDurationMs
  ) {
    return decisionFor("climax");
  }

  return decisionFor("developing");
};

/** Friendly aliases for callers that prefer the policy-object style. */
export const getForumStoryNarrativeStage = evaluateForumStoryNarrative;
export const ForumStoryNarrativePolicy = {
  evaluate: evaluateForumStoryNarrative,
};
export const forumStoryNarrativePolicy = ForumStoryNarrativePolicy;
