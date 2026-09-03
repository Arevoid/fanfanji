import {
  projectPromptBoundary,
  projectPromptPersona,
  projectPromptTime,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type { CognitivePromptAdapter, ProactivePromptContext } from "./types";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import type {
  CharacterRoutinePeriod,
  CharacterRoutineState,
} from "../../../domain/characterLife/characterRoutine/characterRoutineTypes";
import type { ProactiveTopicContext } from "../../chat/services/proactiveCognitiveContext";

interface ProactivePromptRoutineContext {
  period: CharacterRoutinePeriod;
  state: CharacterRoutineState;
}

type ProactiveContextWithRoutine = CharacterCognitiveContext & {
  routineContext?: ProactivePromptRoutineContext;
  topicContext?: ProactiveTopicContext;
  timeAwareness?: boolean;
};

type ProactivePromptContextWithRoutine = ProactivePromptContext & {
  routineContext?: ProactivePromptRoutineContext;
  topicContext?: ProactiveTopicContext;
  timeAwareness?: boolean;
};

function projectProactiveRoutineContext(context: CharacterCognitiveContext): Pick<
  ProactivePromptContextWithRoutine,
  "routineContext"
> {
  const routineContext = (context as ProactiveContextWithRoutine).routineContext;
  if (!routineContext) return {};
  return {
    routineContext: {
      period: routineContext.period,
      state: routineContext.state,
    },
  };
}

function projectProactiveRelationshipContext(context: Parameters<CognitivePromptAdapter<ProactivePromptContext>>[0]): Pick<
  ProactivePromptContext,
  "relationshipState" | "relationshipTimeline"
> {
  const timeline = context.relationshipTimeline;
  if (!timeline) return {};

  // A Timeline is read-only but may include events that were deliberately
  // excluded from the cognitive snapshot. Only re-project its safe subset.
  const safeEventsById = new Map(context.recentEvents.map((event) => [event.id, event]));
  const recentEvents = timeline.recentEvents
    .map((event) => safeEventsById.get(event.id))
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .slice(0, 4)
    .map(({ kind, summary, occurredAt, confidence }) => ({ kind, summary, occurredAt, confidence }));
  const state = context.relationshipState;
  const lastMeaningfulEventAt = state?.lastMeaningfulEventAt;
  const hasRelationshipContext = Boolean(state) || recentEvents.length > 0 || timeline.state?.openLoops.length || timeline.state?.boundaries.length;
  if (!hasRelationshipContext) return {};

  return {
    ...(state ? { relationshipState: { stage: state.stage, tone: state.tone } } : {}),
    relationshipTimeline: {
      recentEvents,
      openLoops: [...(timeline.state?.openLoops.map((loop) => loop.description) ?? [])],
      boundaries: [...(timeline.state?.boundaries ?? [])],
      ...(lastMeaningfulEventAt === undefined ? {} : { lastMeaningfulEventAt }),
    },
  };
}

function compactTopicHints(topics: readonly string[] | undefined, limit: number): string[] {
  if (!topics) return [];
  return topics
    .map((topic) => topic.trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, limit);
}

function projectProactiveTopicContext(
  context: Parameters<CognitivePromptAdapter<ProactivePromptContext>>[0],
): Pick<ProactivePromptContextWithRoutine, "topicContext"> {
  const topicContext = (context as ProactiveContextWithRoutine).topicContext;
  if (!topicContext) return {};
  return {
    topicContext: {
      recentTopics: compactTopicHints(topicContext.recentTopics, 8),
      repeatedTopics: compactTopicHints(topicContext.repeatedTopics, 4),
      cooldownTopics: compactTopicHints(topicContext.cooldownTopics, 8),
    },
  };
}

/**
 * Builds a relation-safe proactive projection. Open context is intentionally
 * empty until a separately audited source is introduced.
 */
export const buildProactivePromptContext = (
  context: Parameters<CognitivePromptAdapter<ProactivePromptContext>>[0],
  options?: Parameters<CognitivePromptAdapter<ProactivePromptContext>>[1],
): ProactivePromptContextWithRoutine => ({
  persona: projectPromptPersona(context),
  // Legacy compressedMemory is not a proactive source. Relationship state and
  // event projections are supplied separately and remain rebuildable.
  relationship: { stage: context.relationship.stage },
  ...projectProactiveRelationshipContext(context),
  ...projectProactiveRoutineContext(context),
  ...projectProactiveTopicContext(context),
  ...((context as ProactiveContextWithRoutine).timeAwareness === undefined
    ? {}
    : { timeAwareness: (context as ProactiveContextWithRoutine).timeAwareness }),
  recentMeaningfulEvents: selectSafePromptEvents(context, options),
  openContext: [],
  boundaries: projectPromptBoundary(context),
  time: projectPromptTime(context),
});

/** Formats the safe supplement without exposing scope IDs, private Memory, or InnerVoice data. */
export function formatProactivePromptContext(context: ProactivePromptContextWithRoutine | undefined): string {
  if (!context) return "";

  const events = context.recentMeaningfulEvents.map((event) => `- ${event.summary}`);
  const relationshipState = context.relationshipState
    ? [`- Current relationship stage: ${context.relationshipState.stage}`, `- Current relationship tone: ${context.relationshipState.tone}`]
    : [];
  const relationshipEvents = context.relationshipTimeline?.recentEvents.map((event) => `- ${event.summary}`) ?? [];
  const openLoops = context.relationshipTimeline?.openLoops.map((item) => `- Candidate topic only; do not assume completion: ${item}`) ?? [];
  const relationshipBoundaries = context.relationshipTimeline?.boundaries.map((item) => `- ${item}`) ?? [];
  const topicContext = context.topicContext;
  const recentTopics = topicContext?.recentTopics.map((topic) => `- ${topic}`) ?? [];
  const repeatedTopics = topicContext?.repeatedTopics.map((topic) => `- ${topic}`) ?? [];
  const cooldownTopics = topicContext?.cooldownTopics.map((topic) => `- ${topic}`) ?? [];
  const topicGuidance = topicContext && (recentTopics.length > 0 || repeatedTopics.length > 0 || cooldownTopics.length > 0)
    ? [
      "Topic diversity guidance (hints only; not facts or hard bans):",
      ...(recentTopics.length > 0 ? ["Recent proactive topics:", ...recentTopics] : []),
      ...(repeatedTopics.length > 0 ? ["Recently repeated proactive topics:", ...repeatedTopics] : []),
      ...(cooldownTopics.length > 0 ? ["Proactive topics currently in cooldown:", ...cooldownTopics] : []),
      "Use these only as candidate-topic guidance; do not block, reschedule, or suppress a message because of them.",
    ]
    : [];
  const lastMeaningfulEvent = context.relationshipTimeline?.lastMeaningfulEventAt;
  const routine = context.routineContext;
  const timeAwareness = context.timeAwareness !== false;

  return [
    "[RELATION-SAFE PROACTIVE COGNITIVE CONTEXT]",
    "Use only the verified information below when directly relevant. Do not infer shared scenes, locations, actions, user experiences, or an unconfirmed relationship change.",
    // Persona, backstory and the base relationship are already supplied by
    // projectCharacterPrompt. This adapter adds request-scoped state only.
    "Request-scoped relationship context:",
    ...relationshipState,
    ...(events.length > 0 ? ["Verified recent events:", ...events] : []),
    ...(relationshipEvents.length > 0 ? ["Recent safe relationship events:", ...relationshipEvents] : []),
    ...(openLoops.length > 0 ? ["Open relationship loops (candidate topics only):", ...openLoops] : []),
    ...(relationshipBoundaries.length > 0 ? ["Relationship boundaries:", ...relationshipBoundaries] : []),
    ...topicGuidance,
    ...(lastMeaningfulEvent === undefined ? [] : [`- Last meaningful relationship event at: ${lastMeaningfulEvent}`]),
    ...(timeAwareness ? [`Time context: ${context.time.date} ${context.time.time}${context.time.period ? ` (${context.time.period})` : ""}`] : []),
    ...(timeAwareness && routine ? [
      "Routine context (behavior reference only):",
      `- Current time period: ${routine.period}`,
      `- Current routine state: ${routine.state}`,
      "Treat this as a plausibility hint only; do not suppress, reschedule, or delay a message because of it.",
    ] : []),
  ].join("\n");
}
