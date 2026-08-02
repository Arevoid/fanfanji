import {
  projectPromptBoundary,
  projectPromptPersona,
  projectPromptRelationship,
  projectPromptTime,
  selectChatPromptFacts,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type { ChatPromptContext, CognitivePromptAdapter } from "./types";

function projectChatRelationshipContext(context: Parameters<CognitivePromptAdapter<ChatPromptContext>>[0]): Pick<
  ChatPromptContext,
  "relationshipState" | "relationshipTimeline"
> {
  const timeline = context.relationshipTimeline;
  if (!timeline) return {};

  // The cognitive snapshot has already scope-filtered safe events. Intersect
  // the Timeline with that list so a read-only Timeline never re-exposes a
  // private event that was intentionally excluded from the snapshot.
  const safeEventsById = new Map(context.recentEvents.map((event) => [event.id, event]));
  const recentEvents = timeline.recentEvents
    .map((event) => safeEventsById.get(event.id))
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .slice(0, 4)
    .map(({ kind, summary, occurredAt, confidence }) => ({ kind, summary, occurredAt, confidence }));

  const state = context.relationshipState;
  const hasRelationshipContext = Boolean(state) || recentEvents.length > 0 || timeline.state?.openLoops.length || timeline.state?.boundaries.length;
  if (!hasRelationshipContext) return {};

  return {
    ...(state ? { relationshipState: { stage: state.stage, tone: state.tone } } : {}),
    relationshipTimeline: {
      recentEvents,
      openLoops: [...(timeline.state?.openLoops.map((loop) => loop.description) ?? [])],
      boundaries: [...(timeline.state?.boundaries ?? [])],
    },
  };
}

/** Builds a prompt-safe direct-chat projection without formatting Prompt text. */
export const buildChatPromptContext: CognitivePromptAdapter<ChatPromptContext> = (context, options) => ({
  persona: projectPromptPersona(context),
  relationship: projectPromptRelationship(context),
  ...projectChatRelationshipContext(context),
  relevantMemories: selectChatPromptFacts(context, options),
  safeEvents: selectSafePromptEvents(context, options),
  boundaries: projectPromptBoundary(context),
  time: projectPromptTime(context),
  ...(context.routineContext ? {
    routineContext: {
      period: context.routineContext.period,
      state: context.routineContext.state,
    },
  } : {}),
});

/**
 * Formats only the new, non-duplicative cognitive supplement. Existing chat
 * prompt sections remain the authority for persona, relationship, and clock
 * presentation; this block adds scoped evidence and boundaries only.
 */
export function formatChatPromptContext(context: ChatPromptContext | undefined): string {
  if (!context) return "";

  const facts = context.relevantMemories.map((fact) => `- ${fact.content}`);
  const events = context.safeEvents.map((event) => `- ${event.summary}`);
  const boundaries = [
    ...context.boundaries.unknown.map((item) => `- Unknown: ${item}`),
    ...context.boundaries.forbidden.map((item) => `- Forbidden: ${item}`),
    ...context.boundaries.rules.map((item) => `- Rule: ${item}`),
  ];
  const relationshipState = context.relationshipState
    ? [`- Stage: ${context.relationshipState.stage}`, `- Tone: ${context.relationshipState.tone}`]
    : [];
  const relationshipEvents = context.relationshipTimeline?.recentEvents.map((event) => `- ${event.summary}`) ?? [];
  const openLoops = context.relationshipTimeline?.openLoops.map((item) => `- ${item}`) ?? [];
  const relationshipBoundaries = context.relationshipTimeline?.boundaries.map((item) => `- ${item}`) ?? [];
  const routine = context.routineContext;
  const routineContext = routine ? [
    "Routine context (behavior reference only):",
    `- Current time period: ${routine.period}`,
    `- Current routine state: ${routine.state}`,
  ] : [];
  if (
    facts.length === 0 &&
    events.length === 0 &&
    boundaries.length === 0 &&
    relationshipState.length === 0 &&
    relationshipEvents.length === 0 &&
    openLoops.length === 0 &&
    relationshipBoundaries.length === 0 &&
    routineContext.length === 0
  ) return "";

  return [
    "[RELATION-SCOPED COGNITIVE CONTEXT]",
    "Use only the verified information below when it is directly relevant. Do not infer additional shared scenes, locations, actions, or user experiences.",
    ...(facts.length > 0 ? ["Verified relevant memories:", ...facts] : []),
    ...(events.length > 0 ? ["Verified recent events:", ...events] : []),
    ...(relationshipState.length > 0 ? ["Current relationship:", ...relationshipState] : []),
    ...(relationshipEvents.length > 0 ? ["Recent relationship events:", ...relationshipEvents] : []),
    ...(openLoops.length > 0 ? ["Open relationship loops:", ...openLoops] : []),
    ...(relationshipBoundaries.length > 0 ? ["Relationship boundaries:", ...relationshipBoundaries] : []),
    ...routineContext,
    ...(boundaries.length > 0 ? ["Knowledge boundaries:", ...boundaries] : []),
  ].join("\n");
}
