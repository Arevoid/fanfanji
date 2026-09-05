import type { NarrativeStage } from "./forumStoryNarrativePolicy";
import type {
  ForumStory,
  StoryEvent,
} from "./forumStoryTypes";

/** Event kinds that can be proposed inside a ForumStory scope. */
export type ForumStoryPlannedEventType =
  | "character_reveal"
  | "conflict"
  | "discovery"
  | "interaction"
  | "resolution"
  | "daily_event";

export type ForumStoryEventImportance = "low" | "medium" | "high";

export interface ForumStoryEventPlannerInput {
  readonly story?: ForumStory | null;
  readonly events: readonly StoryEvent[];
  readonly stage: NarrativeStage;
}

export interface ForumStoryEventPlan {
  readonly type: ForumStoryPlannedEventType;
  readonly reason: string;
  readonly importance: ForumStoryEventImportance;
}

const hasEventType = (
  events: readonly StoryEvent[],
  storyId: string,
  type: StoryEvent["type"],
): boolean => events.some(
  (event) => event.storyId === storyId && event.status === "confirmed" && event.type === type,
);

const plan = (
  type: ForumStoryPlannedEventType,
  reason: string,
  importance: ForumStoryEventImportance,
): ForumStoryEventPlan => ({ type, reason, importance });

/**
 * Selects one next-event candidate from story-scope history.
 *
 * This is deliberately a planner, not a generator: it returns only a type,
 * explanation, and importance. Foreign story events are ignored, completed
 * stories are rejected, and no storage, AI, or private context is accessed.
 */
export const planForumStoryEvent = (
  input: ForumStoryEventPlannerInput,
): ForumStoryEventPlan | null => {
  const story = input.story;
  if (!story || story.status === "completed" || input.stage === "completed") return null;

  switch (input.stage) {
    case "opening":
      if (!hasEventType(input.events, story.id, "post_created")) {
        return plan(
          "character_reveal",
          "Introduce a defining character detail before the story develops",
          "medium",
        );
      }
      return plan(
        "interaction",
        "Let the characters establish their first meaningful exchange",
        "low",
      );

    case "developing":
      if (!hasEventType(input.events, story.id, "story_progressed")) {
        return plan(
          "discovery",
          "Reveal information that moves the developing story forward",
          "medium",
        );
      }
      if (!hasEventType(input.events, story.id, "comment_added")) {
        return plan(
          "conflict",
          "Introduce a developing disagreement or obstacle",
          "high",
        );
      }
      return plan(
        "interaction",
        "Continue the relationship or discussion while the plot develops",
        "medium",
      );

    case "climax":
      if (!hasEventType(input.events, story.id, "comment_added")) {
        return plan(
          "conflict",
          "Escalate the central tension into a major conflict",
          "high",
        );
      }
      return plan(
        "resolution",
        "Resolve the central conflict after the climax",
        "high",
      );

    case "ending":
      return plan(
        "resolution",
        "Close the remaining story thread",
        "high",
      );

    default:
      return null;
  }
};

/** Friendly aliases for callers that prefer policy/service naming. */
export const evaluateForumStoryEventPlan = planForumStoryEvent;
export const ForumStoryEventPlanner = {
  plan: planForumStoryEvent,
  planNextEvent: planForumStoryEvent,
};
export const forumStoryEventPlanner = ForumStoryEventPlanner;
