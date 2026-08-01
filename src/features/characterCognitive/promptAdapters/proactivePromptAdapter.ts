import {
  projectPromptBoundary,
  projectPromptPersona,
  projectPromptRelationship,
  projectPromptTime,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type { CognitivePromptAdapter, ProactivePromptContext } from "./types";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import type {
  CharacterRoutinePeriod,
  CharacterRoutineState,
} from "../../../domain/characterLife/characterRoutine/characterRoutineTypes";

interface ProactivePromptRoutineContext {
  period: CharacterRoutinePeriod;
  state: CharacterRoutineState;
}

type ProactiveContextWithRoutine = CharacterCognitiveContext & {
  routineContext?: ProactivePromptRoutineContext;
};

type ProactivePromptContextWithRoutine = ProactivePromptContext & {
  routineContext?: ProactivePromptRoutineContext;
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

/**
 * Builds a relation-safe proactive projection. Open context is intentionally
 * empty until a separately audited source is introduced.
 */
export const buildProactivePromptContext = (
  context: Parameters<CognitivePromptAdapter<ProactivePromptContext>>[0],
  options?: Parameters<CognitivePromptAdapter<ProactivePromptContext>>[1],
): ProactivePromptContextWithRoutine => ({
  persona: projectPromptPersona(context),
  relationship: projectPromptRelationship(context),
  ...projectProactiveRelationshipContext(context),
  ...projectProactiveRoutineContext(context),
  recentMeaningfulEvents: selectSafePromptEvents(context, options),
  openContext: [],
  boundaries: projectPromptBoundary(context),
  time: projectPromptTime(context),
});

/** Formats the safe supplement without exposing scope IDs, private Memory, or InnerVoice data. */
export function formatProactivePromptContext(context: ProactivePromptContextWithRoutine | undefined): string {
  if (!context) return "";

  const relationship = [
    `- Current relationship: ${context.relationship.stage}`,
    ...(context.relationship.compressedMemory ? [`- Safe relationship summary: ${context.relationship.compressedMemory}`] : []),
  ];
  const events = context.recentMeaningfulEvents.map((event) => `- ${event.summary}`);
  const relationshipState = context.relationshipState
    ? [`- Current relationship stage: ${context.relationshipState.stage}`, `- Current relationship tone: ${context.relationshipState.tone}`]
    : [];
  const relationshipEvents = context.relationshipTimeline?.recentEvents.map((event) => `- ${event.summary}`) ?? [];
  const openLoops = context.relationshipTimeline?.openLoops.map((item) => `- Candidate topic only; do not assume completion: ${item}`) ?? [];
  const relationshipBoundaries = context.relationshipTimeline?.boundaries.map((item) => `- ${item}`) ?? [];
  const lastMeaningfulEvent = context.relationshipTimeline?.lastMeaningfulEventAt;
  const routine = context.routineContext;

  return [
    "[RELATION-SAFE PROACTIVE COGNITIVE CONTEXT]",
    "Use only the verified information below when directly relevant. Do not infer shared scenes, locations, actions, user experiences, or an unconfirmed relationship change.",
    "Character focus:",
    `- Name: ${context.persona.name}`,
    ...(context.persona.personality ? [`- Personality: ${context.persona.personality}`] : []),
    ...(context.persona.backstory ? [`- Background: ${context.persona.backstory}`] : []),
    "Relationship context:",
    ...relationship,
    ...relationshipState,
    ...(events.length > 0 ? ["Verified recent events:", ...events] : []),
    ...(relationshipEvents.length > 0 ? ["Recent safe relationship events:", ...relationshipEvents] : []),
    ...(openLoops.length > 0 ? ["Open relationship loops (candidate topics only):", ...openLoops] : []),
    ...(relationshipBoundaries.length > 0 ? ["Relationship boundaries:", ...relationshipBoundaries] : []),
    ...(lastMeaningfulEvent === undefined ? [] : [`- Last meaningful relationship event at: ${lastMeaningfulEvent}`]),
    `Time context: ${context.time.date} ${context.time.time}${context.time.period ? ` (${context.time.period})` : ""}`,
    ...(routine ? [
      "Routine context (behavior reference only):",
      `- Current time period: ${routine.period}`,
      `- Current routine state: ${routine.state}`,
      "Treat this as a plausibility hint only; do not suppress, reschedule, or delay a message because of it.",
    ] : []),
  ].join("\n");
}
